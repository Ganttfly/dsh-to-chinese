/**
 * dsh-to-chinese — Client (browser) half.
 *
 * Contributes three things:
 *
 * 1. One row in a document tab's actions menu (`sidebar.right.tab.menu.item`).
 *    The seat hands the entry the tab it belongs to plus `dismiss`, so the entry
 *    renders the whole row itself and decides its own visibility from
 *    `tab.contentId`: it offers nothing on a tab that is not a file. The row
 *    copies the design system's own menu cell (`Menu.module.css` `.item`) so it
 *    reads as one of the menu's rows.
 *
 * 2. A page tab type (`to-chinese`) with its own body, registered in the two
 *    public stages the preview plugin also uses: the declaration through
 *    `ctx.sidebarRightTabs.register`, the body through the keyed
 *    `sidebar.right.pane.tab` slot, joined by this plugin's id. The tab — not a
 *    corner toast — is where the work reports itself: it opens immediately and
 *    shows progress, then hands itself over to the document preview with
 *    `openResource(result, { replaceTab: true })` so the finished bilingual file
 *    opens in the very slot the user was already watching. A failure stays in
 *    the tab, with its reason and a retry — nothing is written to disk for a
 *    translation that never completed.
 *
 * 3. A fallback pill in `shell.overlay`, used only when the tab cannot be opened
 *    at all (a wiring fault): the failure still has somewhere to appear.
 *
 * @module dsh-to-chinese/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-to-chinese',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace carrying this plugin's copy. */
    const LOCALE_NS = 'toChinese'

    /** Dictionaries for the namespace; English is the fallback. */
    const DICTS = {
      en: {
        action: 'ToChinese (English + Chinese)',
        tabTitle: 'ToChinese',
        busy: 'Translating…',
        busyHint: 'The bilingual copy opens here when it is ready.',
        done: 'Translated',
        failed: 'Translation failed',
        retry: 'Retry',
        dismiss: 'Dismiss',
        noAddress: 'this tab was opened without a document address',
      },
      'zh-CN': {
        action: '翻译成中文（中英对照）',
        tabTitle: '翻译',
        busy: '翻译中…',
        busyHint: '完成后会在这里直接打开中英对照文件。',
        done: '已翻译',
        failed: '翻译失败',
        retry: '重试',
        dismiss: '关闭',
        noAddress: '这个标签页没有带文档地址，无法翻译',
      },
    }

    /** The Host route this plugin owns. */
    const ROUTE = '/to-chinese/translate'

    /** This plugin's identity in the tab system; also the body slot's key. */
    const TAB_TYPE_ID = 'dsh-to-chinese'

    /** The page kind this plugin opens tabs of. */
    const TAB_KIND = 'to-chinese'

    /** The address prefix that identifies a tab as a file. */
    const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

    /** Stable mask identity: every instance draws the same knock-out, so it may be shared. */
    const MASK_ID = 'dsh-to-chinese-badge'

    /** The badge's knock-out outline: 文 upper-left, A lower-right, inside a 16px square. */
    const GLYPH_PATH = [
      'M4.5 3.2 L6.1 3.2',
      'M2.2 4.8 L8.2 4.8',
      'M3.2 6.3 L7.2 9.3',
      'M7.2 6.3 L3.2 9.3',
      'M9.3 12.5 L11.4 7.6 L13.5 12.5',
      'M10 10.8 L12.8 10.8',
    ].join(' ')

    /**
     * Component-local styles; rendered as an element so unmounting removes them.
     * The `.dsh-to-chinese-item*` rules are the design system's menu cell
     * (`Menu.module.css` `.item` / `.itemIcon` / `.itemLabel`) restated under this
     * plugin's own class names, so a menu row contributed here is laid out and
     * coloured exactly like the rows the kit already draws.
     */
    const CSS = `
.dsh-to-chinese-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.dsh-to-chinese-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-to-chinese-item:disabled { opacity: 0.4; cursor: not-allowed; }
.dsh-to-chinese-itemIcon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-to-chinese-itemLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
  /* The overlay layer is click-through; the pill opts back in to be dismissable. */
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
     * The translate badge: a filled rounded square with 文 and A knocked out of
     * it, so the glyphs show whatever is behind them in either theme.
     * @returns the icon element.
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
     * The file address a menu entry was opened for.
     * @param tab - the tab the menu belongs to.
     * @returns the `dsh-resource://file/…` address, or `null` for anything else.
     */
    function fileAddressOf(tab) {
      const contentId = tab === null || tab === undefined ? undefined : tab.contentId
      if (typeof contentId !== 'string' || !contentId.startsWith(FILE_ADDRESS_PREFIX)) return null
      return contentId
    }

    /**
     * The last path segment of an address, decoded, for display.
     * @param address - the file address.
     * @returns a short readable name, or the address itself when it cannot be read.
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
     * Read one key through the locale service, falling back to the shipped
     * English copy whenever the namespace is unregistered or the dictionary has
     * no entry — an unbound key comes back as the key itself.
     * @param locale - the client locale service, when mounted.
     * @param key - dictionary key.
     * @returns the copy to show.
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
     * The one failure message the fallback pill reads. The tab carries its own
     * state; this only covers a failure that happened before a tab existed.
     * @returns the store: a snapshot reader, a subscriber, and the writer.
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
                // Copy is cosmetic: a rejected dictionary must not take the plugin down with it.
                console.error('[to-chinese] dictionary registration failed', error)
              }
            }
            return () => {
              for (const dispose of disposers) dispose()
            }
          }, 'to-chinese dictionaries')
        }

        const errors = createErrorStore()

        /** Re-render on locale registration and locale switches. */
        function useLocaleRevision() {
          const [revision, setRevision] = React.useState(0)
          React.useEffect(() => {
            const service = ctx.get('locale')
            if (service === undefined) return undefined
            return service.subscribe(() => setRevision((value) => value + 1))
          }, [])
          return revision
        }

        /** Follow the fallback-only error store. */
        function useError() {
          const [message, setMessage] = React.useState(errors.get)
          React.useEffect(() => errors.subscribe(() => setMessage(errors.get())), [])
          return message
        }

        const t = (key) => copy(ctx.get('locale'), key)

        /**
         * Ask the Host to translate one document.
         * @param address - the document's `dsh-resource://file/…` address.
         * @returns the Host payload carrying the finished file's address.
         */
        async function translate(address) {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ address }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok || payload.ok !== true) throw new Error(payload.error || `HTTP ${response.status}`)
          return payload
        }

        /**
         * Open a translation tab for one document. Everything after this point
         * belongs to the tab; only a failure to open one lands in the pill.
         * @param address - the document's `dsh-resource://file/…` address.
         */
        function openTranslateTab(address) {
          try {
            ctx.sidebarRight.openTab(TAB_KIND, { params: { address } })
            errors.set('')
          } catch (error) {
            console.error('[to-chinese] could not open a translation tab', error)
            errors.set(error instanceof Error ? error.message : String(error))
          }
        }

        /**
         * The body of one translation tab: it runs the job for the address it was
         * opened with, then replaces itself with the document it produced.
         */
        function TranslateTab(props) {
          useLocaleRevision()
          const info = props.useTabInfo()
          const tab = info.tab
          const params = tab.navigation === undefined || tab.navigation === null ? {} : tab.navigation.params ?? {}
          const address = typeof params.address === 'string' ? params.address : undefined
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
            translate(address)
              .then((payload) => {
                if (!live) return
                setState({ phase: 'done', message: '' })
                // Hand the slot over: the document preview opens the finished
                // bilingual file exactly where this tab was.
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
              state.phase === 'busy' ? h('span', { key: 'hint', className: 'dsh-to-chinese-tabBody' }, t('busyHint')) : null,
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

        /** One row in a tab's actions menu; renders nothing for a tab that is not a file. */
        function TabMenuEntry(props) {
          useLocaleRevision()
          const address = fileAddressOf(props.tab)
          if (address === null) return null
          return h(
            'button',
            {
              type: 'button',
              className: 'dsh-to-chinese-item',
              onClick: () => {
                // The menu belongs to the kit: an acting entry closes it itself.
                props.dismiss()
                openTranslateTab(address)
              },
            },
            h('span', { className: 'dsh-to-chinese-itemIcon' }, h(TranslateBadge)),
            h('span', { className: 'dsh-to-chinese-itemLabel' }, t('action')),
          )
        }

        /** The fallback surface, shown only when a translation tab could not be opened. */
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

        // Stage 1 — the declaration: what handles this kind, and what its chip says.
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TAB_TYPE_ID,
              kind: TAB_KIND,
              title: () => t('tabTitle'),
            }),
          'to-chinese tab type',
        )

        // Stage 2 — the implementation: the body, dispatched by this plugin's id.
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_TYPE_ID }, TranslateTab),
        )

        ctx.slots.inject('sidebar.right.tab.menu.item', () =>
          ctx.slots.register(
            { name: 'sidebar.right.tab.menu.item', id: 'to-chinese', order: 60, label: () => t('action') },
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
