/**
 * dsh-to-chinese —— 客户端（浏览器）部分。
 *
 * 它贡献三样东西：
 *
 * 1. 文档标签页操作菜单（`sidebar.right.tab.menu.item`）中的两行：
 *    "To Chinese" 只写出中文文本，"To Chinese (bilingual)" 写出逐句对照的阅读稿。
 *    座位会把每个条目所属的标签页连同 `dismiss` 一起交给它，因此条目自行渲染整行，
 *    并根据 `tab.contentId` 决定自己的可见性：对于不是文件的标签页，它什么都不提供。
 *    每一行都复述菜单本身已经为自己绘制的单元格（`DockKit.module.css` 的 `.menuItem`）：
 *    同样的内边距、同样的圆角、同样的字号、同样的悬停填充，因此它读起来就像
 *    菜单自己的一行。
 *
 * 2. 每种模式一个页签类型（`to-chinese`、`to-chinese-zh`），各自带有自己的主体，
 *    并在预览插件同样使用的两个公开阶段中注册：声明通过
 *    `ctx.sidebarRightTabs.register` 完成，主体通过带键的 `sidebar.right.pane.tab`
 *    插槽完成，两者由本插件的 id 连接起来。工作汇报自己的地方是这个标签页，
 *    而不是角落里的 toast：它立即打开并显示进度，然后用
 *    `openResource(result, { replaceTab: true })` 把自己交给文档预览，
 *    好让完成后的中英对照文件正好在用户一直盯着的那个槽位里打开。失败会留在
 *    标签页里，连同原因和一次重试——对于始终没有完成的翻译，不会向磁盘写入任何东西。
 *
 * 3. `shell.overlay` 中的一个兜底胶囊提示，仅在标签页完全无法打开时
 *    （接线故障）使用：失败仍然有地方可以现身。
 *
 * @module dsh-to-chinese/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-to-chinese',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** 承载本插件文案的语言区域命名空间。 */
    const LOCALE_NS = 'toChinese'

    /** 该命名空间的词典；英文是回退项。 */
    const DICTS = {
      en: {
        action: 'To Chinese (bilingual)',
        actionZh: 'To Chinese',
        tabTitle: 'To Chinese (bilingual)',
        tabTitleZh: 'To Chinese',
        busy: 'Translating…',
        busyHint: 'The bilingual copy opens here when it is ready.',
        busyHintZh: 'The Chinese copy opens here when it is ready.',
        done: 'Translated',
        failed: 'Translation failed',
        retry: 'Retry',
        dismiss: 'Dismiss',
        noAddress: 'this tab was opened without a document address',
      },
      'zh-CN': {
        action: '翻译成中文（中英对照）',
        actionZh: '翻译成中文（仅中文）',
        tabTitle: '翻译成中文（中英对照）',
        tabTitleZh: '翻译成中文（仅中文）',
        busy: '翻译中…',
        busyHint: '完成后会在这里直接打开中英对照文件。',
        busyHintZh: '完成后会在这里直接打开中文文件。',
        done: '已翻译',
        failed: '翻译失败',
        retry: '重试',
        dismiss: '关闭',
        noAddress: '这个标签页没有带文档地址，无法翻译',
      },
    }

    /** 本插件拥有的 Host 路由。 */
    const ROUTE = '/to-chinese/translate'

    /**
     * 本插件提供的两种呈现。每种模式对应一个菜单行、一个标签页种类和一个主体插槽键，
     * 因此两者可以并排打开。
     */
    const MODES = {
      bilingual: {
        typeId: 'dsh-to-chinese',
        kind: 'to-chinese',
        menuId: 'to-chinese',
        actionKey: 'action',
        titleKey: 'tabTitle',
        hintKey: 'busyHint',
      },
      zh: {
        typeId: 'dsh-to-chinese-zh',
        kind: 'to-chinese-zh',
        menuId: 'to-chinese-zh',
        actionKey: 'actionZh',
        titleKey: 'tabTitleZh',
        hintKey: 'busyHintZh',
      },
    }

    /** 菜单行顺序：仅中文那一行位于中英对照那一行之上。 */
    const MENU_ORDER = { zh: 50, bilingual: 60 }

    /** 用来把标签页标识为文件的地址前缀。 */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

    /** 稳定的遮罩标识：每个实例绘制的镂空图案都相同，因此可以共享。 */
    const MASK_ID = 'dsh-to-chinese-badge'

    /** 徽标的镂空轮廓：文在左上、A 在右下，位于 16px 的正方形之内。 */
    const GLYPH_PATH = [
      'M4.5 3.2 L6.1 3.2',
      'M2.2 4.8 L8.2 4.8',
      'M3.2 6.3 L7.2 9.3',
      'M7.2 6.3 L3.2 9.3',
      'M9.3 12.5 L11.4 7.6 L13.5 12.5',
      'M10 10.8 L12.8 10.8',
    ].join(' ')

    /**
     * 组件本地样式；以元素形式渲染，这样卸载时它们会被一并移除。
     * `.dsh-to-chinese-item` 规则复述了宿主标签页菜单已经为自己绘制的那一行
     * （`DockKit.module.css` 的 `.menuItem`）：同样的内边距、同样的圆角、
     * 同样的字号、同样的悬停填充——因此这里贡献的行读起来就像菜单自己的条目，
     * 而不是一个外来控件。
     */
    const CSS = `
.dsh-to-chinese-item {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  color: var(--dsw-alias-label-primary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-to-chinese-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-to-chinese-item:disabled { opacity: 0.4; cursor: not-allowed; }

.dsh-to-chinese-tab {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 24px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-to-chinese-tabIcon { color: var(--dsw-alias-label-tertiary); }
.dsh-to-chinese-tabIcon[data-phase="busy"] { animation: dsh-to-chinese-breathe 1.6s ease-in-out infinite; }
.dsh-to-chinese-tabIcon[data-phase="failed"] { color: var(--dsw-alias-state-error-primary); }
.dsh-to-chinese-tabHeadline { color: var(--dsw-alias-label-primary); font-size: 14px; }
.dsh-to-chinese-tabHeadline[data-phase="failed"] { color: var(--dsw-alias-state-error-primary); }
.dsh-to-chinese-tabBody { max-width: 360px; }
.dsh-to-chinese-tabFile {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.dsh-to-chinese-tabReason {
  max-width: 460px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  word-break: break-word;
}
.dsh-to-chinese-retry {
  margin-top: 4px;
  padding: 6px 16px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}
.dsh-to-chinese-retry:hover { background: var(--dsw-alias-interactive-bg-hover); }
@keyframes dsh-to-chinese-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

.dsh-to-chinese-pill {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 70;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 380px;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-state-error-primary);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 18px;
  /* 浮层是点击穿透的；胶囊提示重新开启指针事件，以便可以被关闭。 */
  pointer-events: auto;
}
.dsh-to-chinese-pillText {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-state-error-primary);
}
.dsh-to-chinese-dismiss {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.dsh-to-chinese-dismiss:hover { background: var(--dsw-alias-interactive-bg-hover); }
`

    /**
     * 翻译徽标：一个填充的圆角方块，从中镂去 文 和 A，
     * 这样无论哪种主题，字形都会透出它们背后的内容。
     * @returns 图标元素。
     */
    function TranslateBadge() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true, focusable: false, style: { display: 'block' } },
        h(
          'mask',
          { id: MASK_ID, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 16, height: 16 },
          h('rect', { x: 0, y: 0, width: 16, height: 16, rx: 3.6, fill: '#fff' }),
          h('path', {
            d: GLYPH_PATH,
            fill: 'none',
            stroke: '#000',
            strokeWidth: 1.25,
            strokeLinecap: 'round',
          }),
        ),
        h('rect', { x: 0, y: 0, width: 16, height: 16, rx: 3.6, fill: 'currentColor', mask: `url(#${MASK_ID})` }),
      )
    }

    /**
     * 某个菜单条目所针对的文件地址。
     * @param tab - 菜单所属的标签页。
     * @returns `dsh-resource://file/…` 地址；其他情况返回 `null`。
     */
    function fileAddressOf(tab) {
      const contentId = tab === null || tab === undefined ? undefined : tab.contentId
      if (typeof contentId !== 'string' || !contentId.startsWith(FILE_ADDRESS_PREFIX)) return null
      return contentId
    }

    /**
     * 地址的最后一个路径段，解码后用于显示。
     * @param address - 文件地址。
     * @returns 简短可读的名称；无法读取时返回地址本身。
     */
    function displayName(address) {
      if (typeof address !== 'string' || address === '') return ''
      const tail = address.split('/').pop() ?? address
      try {
        return decodeURIComponent(tail)
      } catch {
        return tail
      }
    }

    /**
     * 通过语言区域服务读取一个键；当命名空间未注册或词典中没有对应条目时，
     * 回退到随附的英文文案——未绑定的键会原样返回该键本身。
     * @param locale - 客户端语言区域服务（若已挂载）。
     * @param key - 词典键。
     * @returns 要显示的文案。
     */
    function copy(locale, key) {
      if (locale !== undefined) {
        try {
          const value = locale.bind(LOCALE_NS)(key)
          if (typeof value === 'string' && value !== '' && value !== key) return value
        } catch (error) {
          console.error('[to-chinese] locale lookup failed', error)
        }
      }
      return DICTS.en[key] ?? key
    }

    /**
     * 兜底胶囊提示读取的那一条失败消息。标签页自带状态；
     * 这里只覆盖在标签页出现之前就发生的失败。
     * @returns 该存储：一个快照读取器、一个订阅者，以及写入器。
     */
    function createErrorStore() {
      let message = ''
      const listeners = new Set()
      return {
        get: () => message,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        set(next) {
          message = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    return {
      inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          ctx.effect(() => {
            const disposers = []
            for (const id of Object.keys(DICTS)) {
              try {
                disposers.push(locale.register(LOCALE_NS, id, DICTS[id]))
              } catch (error) {
                // 文案只是装饰性的：一份被拒绝的词典不该把插件一起拖垮。
                console.error('[to-chinese] dictionary registration failed', error)
              }
            }
            return () => {
              for (const dispose of disposers) dispose()
            }
          }, 'to-chinese dictionaries')
        }

        const errors = createErrorStore()

        /** 在语言区域注册和语言区域切换时重新渲染。 */
        function useLocaleRevision() {
          const [revision, setRevision] = React.useState(0)
          React.useEffect(() => {
            const service = ctx.get('locale')
            if (service === undefined) return undefined
            return service.subscribe(() => setRevision((value) => value + 1))
          }, [])
          return revision
        }

        /** 订阅只服务于兜底路径的错误存储。 */
        function useError() {
          const [message, setMessage] = React.useState(errors.get)
          React.useEffect(() => errors.subscribe(() => setMessage(errors.get())), [])
          return message
        }

        const t = (key) => copy(ctx.get('locale'), key)

        /**
         * 请 Host 翻译一个文档。
         * @param address - 文档的 `dsh-resource://file/…` 地址。
         * @param mode - `'bilingual'` 或 `'zh'`：要写入哪一种呈现。
         * @returns 携带成品文件地址的 Host 载荷。
         */
        async function translate(address, mode) {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ address, mode }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          return payload
        }

        /**
         * 为一个文档打开翻译标签页。此后的所有事情都属于这个标签页；
         * 只有打开标签页本身的失败才会落进胶囊提示里。模式决定标签页种类，
         * 因此同一个文件的两种呈现可以并排打开。
         * @param address - 文档的 `dsh-resource://file/…` 地址。
         * @param mode - `'bilingual'` 或 `'zh'`。
         */
        function openTranslateTab(address, mode) {
          try {
            ctx.sidebarRight.openTab(MODES[mode].kind, { params: { address, mode } })
            errors.set('')
          } catch (error) {
            console.error('[to-chinese] could not open a translation tab', error)
            errors.set(error instanceof Error ? error.message : String(error))
          }
        }

        /**
         * 单个翻译标签页的主体：它针对打开时带入的地址跑完任务，
         * 然后用自己产出的文档把自己替换掉。
         */
        function TranslateTab(props) {
          useLocaleRevision()
          const info = props.useTabInfo()
          const tab = info.tab
          const params = tab.navigation === undefined || tab.navigation === null ? {} : tab.navigation.params ?? {}
          const address = typeof params.address === 'string' ? params.address : undefined
          const mode = params.mode === 'zh' ? 'zh' : 'bilingual'
          const revision = tab.navigation === undefined || tab.navigation === null ? 0 : tab.navigation.revision
          const [state, setState] = React.useState({ phase: 'busy', message: '' })
          const [attempt, setAttempt] = React.useState(0)

          React.useEffect(() => {
            if (address === undefined) {
              setState({ phase: 'failed', message: t('noAddress') })
              return undefined
            }
            let live = true
            setState({ phase: 'busy', message: '' })
            translate(address, mode)
              .then((payload) => {
                if (!live) return
                setState({ phase: 'done', message: '' })
                // 交出槽位：文档预览会在本标签页原来的位置上打开成品文件。
                tab.actions.openResource(payload.address, { replaceTab: true })
              })
              .catch((error) => {
                if (!live) return
                console.error('[to-chinese] translation failed', error)
                setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
              })
            return () => {
              live = false
            }
          }, [address, revision, attempt])

          const name = displayName(address)
          const headline = state.phase === 'busy' ? t('busy') : state.phase === 'failed' ? t('failed') : t('done')

          return h(
            React.Fragment,
            null,
            h('style', { key: 'styles' }, CSS),
            h(
              'div',
              { key: 'tab', className: 'dsh-to-chinese-tab' },
              h('span', { key: 'icon', className: 'dsh-to-chinese-tabIcon', 'data-phase': state.phase }, h(TranslateBadge)),
              h('span', { key: 'headline', className: 'dsh-to-chinese-tabHeadline', 'data-phase': state.phase }, headline),
              name === '' ? null : h('span', { key: 'file', className: 'dsh-to-chinese-tabFile', title: name }, name),
              state.phase === 'busy' ? h('span', { key: 'hint', className: 'dsh-to-chinese-tabBody' }, t(MODES[mode].hintKey)) : null,
              state.phase === 'failed'
                ? h(
                    'span',
                    { key: 'reason', className: 'dsh-to-chinese-tabReason' },
                    state.message === '' ? t('failed') : state.message,
                  )
                : null,
              state.phase === 'failed'
                ? h(
                    'button',
                    {
                      key: 'retry',
                      type: 'button',
                      className: 'dsh-to-chinese-retry',
                      onClick: () => setAttempt((value) => value + 1),
                    },
                    t('retry'),
                  )
                : null,
            ),
          )
        }

        /** 标签页操作菜单中的一行；对于不是文件的标签页不做任何渲染。 */
        function TabMenuEntry(props) {
          useLocaleRevision()
          const mode = props.mode === 'zh' ? 'zh' : 'bilingual'
          const address = fileAddressOf(props.tab)
          if (address === null) return null
          return h(
            React.Fragment,
            null,
            // 这一行渲染在工具包自己的菜单内部，远离本插件的其他界面，
            // 因此它的单元格样式随它一起走。
            h('style', { key: 'styles' }, CSS),
            h(
              'button',
              {
                key: 'item',
                type: 'button',
                role: 'menuitem',
                className: 'dsh-to-chinese-item',
                onClick: () => {
                  // 菜单属于工具包：执行动作的条目自行关闭它。
                  props.dismiss()
                  openTranslateTab(address, mode)
                },
              },
              t(MODES[mode].actionKey),
            ),
          )
        }

        /** 仅中文的那一行：同一个单元格，为另一种模式渲染。 */
        function ZhTabMenuEntry(props) {
          return h(TabMenuEntry, { tab: props.tab, dismiss: props.dismiss, mode: 'zh' })
        }

        /** 兜底界面，仅在翻译标签页无法打开时显示。 */
        function FallbackPill() {
          useLocaleRevision()
          const message = useError()
          if (message === '') return null
          return h(
            React.Fragment,
            null,
            h('style', { key: 'styles' }, CSS),
            h(
              'div',
              { key: 'pill', className: 'dsh-to-chinese-pill', role: 'status' },
              h('span', { key: 'text', className: 'dsh-to-chinese-pillText', title: message }, `${t('failed')}: ${message}`),
              h(
                'button',
                {
                  key: 'dismiss',
                  type: 'button',
                  className: 'dsh-to-chinese-dismiss',
                  'aria-label': t('dismiss'),
                  title: t('dismiss'),
                  onClick: () => errors.set(''),
                },
                '✕',
              ),
            ),
          )
        }

        // 阶段 1 —— 声明：每种种类由谁负责，以及它的标签上写什么。
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: MODES.bilingual.typeId,
              kind: MODES.bilingual.kind,
              title: () => t(MODES.bilingual.titleKey),
            }),
          'to-chinese bilingual tab type',
        )
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: MODES.zh.typeId,
              kind: MODES.zh.kind,
              title: () => t(MODES.zh.titleKey),
            }),
          'to-chinese zh tab type',
        )

        // 阶段 2 —— 实现：每个类型 id 一个主体。两者是同一个组件；
        // 模式随标签页自己的导航参数一起传递。
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: MODES.bilingual.typeId }, TranslateTab),
        )
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: MODES.zh.typeId }, TranslateTab),
        )

        // 阶段 3 —— 菜单行：先是仅中文的呈现，然后是中英对照的呈现。
        ctx.slots.inject('sidebar.right.tab.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.tab.menu.item',
              id: MODES.zh.menuId,
              order: MENU_ORDER.zh,
              label: () => t(MODES.zh.actionKey),
            },
            ZhTabMenuEntry,
          ),
        )
        ctx.slots.inject('sidebar.right.tab.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.tab.menu.item',
              id: MODES.bilingual.menuId,
              order: MENU_ORDER.bilingual,
              label: () => t(MODES.bilingual.actionKey),
            },
            TabMenuEntry,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'to-chinese-status', order: 60 }, FallbackPill),
        )
      },
    }
  },
})