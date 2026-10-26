/*
 * dsh-mobile-session.js — 外置浏览器的会话续接（Android 适配层）。
 *
 * 应用内 WebView 与外置浏览器不共享 localStorage：DSH 把当前会话记在
 * `dsh.sessions.current` 里，外置浏览器第一次打开时没有这条记录，于是落在
 * 新建会话页——顶部的标题/标签栏和右上角的面板入口都不会出现。应用把当前
 * 会话键放进交接地址的片段（`#dshMobileSession=session-…`）；片段不发给
 * 服务器，能跨过两次重定向（我们的令牌换 Cookie、dsh 自己的登录 Cookie），
 * 本脚本在官方前端启动前把它写进 DSH 的持久化键，再去掉片段重新加载一次，
 * 保证前端创建存储时已经读到它。
 *
 * 同一份脚本在应用内 WebView 里把当前会话镜像到 `dsh_mobile_last_session`
 * Cookie，应用侧读取后拼出上面那个片段。Cookie 只是本机回环地址上的会话键，
 * 不是凭据；应用侧仍按格式校验，非法值一律忽略。
 */
(() => {
  'use strict'

  /*
   * 外置浏览器不一定是新版内核：荣耀浏览器 3.6.1（Chromium 116）缺少
   * Promise.withResolvers（Chromium 119 才提供）。DSH 的会话控制流用它建流，
   * 缺失时会直接报 “Promise.withResolvers is not a function”，工作区与会话列表
   * 都加载不出来，页面只能停在「选择一个工作区」。补丁必须在官方前端启动前装好；
   * 原生已提供时保持原样，不覆盖。
   */
  if (typeof Promise.withResolvers !== 'function') {
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      writable: true,
      value: function withResolvers () {
        let resolve
        let reject
        const promise = new Promise((resolvePromise, rejectPromise) => {
          resolve = resolvePromise
          reject = rejectPromise
        })
        return { promise, resolve, reject }
      },
    })
  }

  const STORAGE_KEY = 'dsh.sessions.current'
  const COOKIE_NAME = 'dsh_mobile_last_session'
  const HASH_KEY = 'dshMobileSession'
  // 与 HarnessWebAuth.kt 的 SESSION_ID 保持同一口径，任一侧放宽都会让另一侧拒绝。
  const SESSION_ID = /^session-[A-Za-z0-9._-]{1,190}$/u

  const readCookie = () => {
    try {
      for (const part of document.cookie.split(';')) {
        const index = part.indexOf('=')
        if (index <= 0) continue
        if (part.slice(0, index).trim() !== COOKIE_NAME) continue
        return part.slice(index + 1).trim()
      }
    } catch {
      // 受限 WebView 里 document.cookie 可能不可用；镜像只是可选能力。
    }
    return ''
  }

  const writeCookie = sessionId => {
    try {
      if (readCookie() === sessionId) return
      document.cookie = `${COOKIE_NAME}=${sessionId}; Path=/; SameSite=Lax; Max-Age=31536000`
    } catch {
      // 写不进去不影响应用内使用，只是外置浏览器续接会退回新建会话页。
    }
  }

  const mirror = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === null) return
      const parsed = JSON.parse(raw)
      const sessionId = typeof parsed?.sessionId === 'string' ? parsed.sessionId : ''
      // 会话键会原样进 Cookie 与地址片段，先按同一口径校验，避免把任意文本带出去。
      if (SESSION_ID.test(sessionId)) writeCookie(sessionId)
    } catch {
      // localStorage 被禁用或存了非 JSON 值：不影响页面自身的存储逻辑。
    }
  }

  const requested = (() => {
    try {
      const match = new RegExp(`[#&]${HASH_KEY}=([^&]+)`).exec(location.hash)
      if (match === null) return ''
      const value = decodeURIComponent(match[1])
      return SESSION_ID.test(value) ? value : ''
    } catch {
      return ''
    }
  })()

  if (requested !== '') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: requested }))
      // DSH 的存储只在模块启动时 rehydrate，同一份文档里改值不够；replace 去掉片段
      // 后再加载，既不留历史条目，也不会把片段发给服务器。
      location.replace(`${location.pathname}${location.search}`)
      return
    } catch {
      // 写入失败按「没带会话」继续，至少不阻断页面加载。
    }
  }

  // 官方存储通过 localStorage.setItem 写入（createSnapshotStore），包一层即可在
  // 会话切换时同步 Cookie；不轮询，也不改 DSH 自己的存储实现。
  try {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function patchedSetItem (key, value) {
      const result = setItem.call(this, key, value)
      if (key === STORAGE_KEY) mirror()
      return result
    }
  } catch {
    // 冻结原型等极端环境：保留初始镜像，之后的切换不跟进。
  }
  mirror()
})()
