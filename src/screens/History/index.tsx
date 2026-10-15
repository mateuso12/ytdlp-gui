import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/Icon'
import { PillButton } from '../../components/PillButton'
import { fold, useHistory } from '../../stores/history'
import { useUi } from '../../stores/ui'
import styles from './History.module.css'
import { HistoryList } from './HistoryList'

export function HistoryScreen() {
  const { t } = useTranslation()
  const items = useHistory((s) => s.items)
  const go = useUi((s) => s.go)
  const [query, setQuery] = useState('')

  // The store keeps the order things were added in; what the user sees is the order they finished.
  const sorted = useMemo(() => [...items].sort((a, b) => b.finishedAt - a.finishedAt), [items])
  const shown = useMemo(() => {
    const needle = fold(query.trim())
    return needle ? sorted.filter((i) => fold(i.title).includes(needle)) : sorted
  }, [sorted, query])

  return (
    <section className={styles.screen}>
      <div className={styles.head}>
        <h1 className={styles.heading}>{t('screens.history.title')}</h1>
        {items.length > 0 ? (
          <label className={styles.search}>
            <Icon name="search" size={18} />
            <input
              type="search"
              className={styles.searchInput}
              value={query}
              placeholder={t('history.searchPlaceholder')}
              aria-label={t('history.search')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('history.empty')}</p>
          <p className={styles.emptyHint}>{t('history.emptyHint')}</p>
          <PillButton variant="primary" icon="download" onClick={() => go('download')}>
            {t('history.goDownload')}
          </PillButton>
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.noResults} role="status">
          {t('history.noResults', { query: query.trim() })}
        </p>
      ) : (
        <HistoryList items={shown} />
      )}
    </section>
  )
}
