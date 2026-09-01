'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Lang, translations, T, translateRoomName } from '@/lib/i18n';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
  tRoom: (koreanName: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ko',
  setLang: () => {},
  t: translations.ko,
  tRoom: (name) => name,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ko');

  useEffect(() => {
    const stored = localStorage.getItem('lang');
    if (stored === 'ko' || stored === 'en') setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem('lang', l);
  }

  const t = translations[lang];
  const tRoom = (name: string) => lang === 'en' ? translateRoomName(name) : name;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, tRoom }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
