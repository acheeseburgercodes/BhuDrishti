import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LANGUAGES } from '@shared/contracts.js'
import { makeT } from '@shared/i18n.js'

const LangContext = createContext({ lang: 'en', setLang: () => {}, t: makeT('en') })
const KEY = 'bhudrishti.lang'

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(KEY)
    return LANGUAGES.some((l) => l.code === saved) ? saved : 'en'
  })
  useEffect(() => {
    localStorage.setItem(KEY, lang)
    document.documentElement.lang = lang
  }, [lang])
  const value = useMemo(() => ({ lang, setLang, t: makeT(lang) }), [lang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useI18n = () => useContext(LangContext)
