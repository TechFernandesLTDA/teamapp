import { useCallback, useEffect, useState } from 'react'

/**
 * Os esquemas de cores que vinham no Windows 95, em Painel de Controle > Video.
 *
 * Os nomes e as cores sao os originais da Microsoft -- sao fatos sobre um produto
 * historico, nao arte copiada. O que nao da para reproduzir e o bitmap dos
 * papeis de parede; aqui o fundo e gradiente CSS.
 *
 * `desktop` e o fundo, `face` e o cinza dos controles, `title` e o gradiente da
 * barra de titulo ativa. O 98.css assume o esquema padrao, entao trocar tema
 * significa sobrescrever as variaveis dele -- por isso os nomes batem com as
 * custom properties aplicadas em `applyTheme`.
 */
export type ThemeName = 'padrao' | 'chocolate' | 'ameixa' | 'deserto' | 'meia-noite'

type Theme = {
  label: string
  desktop: string
  face: string
  titleFrom: string
  titleTo: string
  titleText: string
  text: string
}

export const THEMES: Record<ThemeName, Theme> = {
  padrao: {
    label: 'Windows padrão',
    desktop: 'linear-gradient(160deg, #3a6ea5 0%, #008080 55%, #006060 100%)',
    face: '#c0c0c0',
    titleFrom: '#000080',
    titleTo: '#1084d0',
    titleText: '#ffffff',
    text: '#000000',
  },
  chocolate: {
    label: 'Chocolate',
    desktop: 'linear-gradient(160deg, #5a3a22 0%, #804000 60%, #3d2010 100%)',
    face: '#c8b8a8',
    titleFrom: '#804000',
    titleTo: '#c08040',
    titleText: '#ffffff',
    text: '#000000',
  },
  ameixa: {
    label: 'Ameixa',
    desktop: 'linear-gradient(160deg, #4b2d4b 0%, #804080 60%, #2d1a2d 100%)',
    face: '#c8b0c8',
    titleFrom: '#804080',
    titleTo: '#c080c0',
    titleText: '#ffffff',
    text: '#000000',
  },
  deserto: {
    label: 'Deserto',
    desktop: 'linear-gradient(160deg, #a08040 0%, #c0a060 55%, #6a5020 100%)',
    face: '#d8d0b0',
    titleFrom: '#808000',
    titleTo: '#c0c060',
    titleText: '#000000',
    text: '#000000',
  },
  'meia-noite': {
    label: 'Meia-noite',
    desktop: 'linear-gradient(160deg, #000020 0%, #101030 60%, #000010 100%)',
    face: '#a0a0a0',
    titleFrom: '#000000',
    titleTo: '#404080',
    titleText: '#ffffff',
    text: '#000000',
  },
}

const KEY = 'teamapp95.theme'

function applyTheme(name: ThemeName) {
  const theme = THEMES[name]
  const root = document.documentElement.style
  root.setProperty('--desktop-bg', theme.desktop)
  root.setProperty('--surface', theme.face)
  root.setProperty('--title-from', theme.titleFrom)
  root.setProperty('--title-to', theme.titleTo)
  root.setProperty('--title-text', theme.titleText)
  root.setProperty('--text', theme.text)
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved && saved in THEMES) return saved as ThemeName
    } catch {
      /* modo privado: cai no padrao */
    }
    return 'padrao'
  })

  // Aplica no mount tambem, nao so na troca: o estado inicial vem do
  // localStorage e as variaveis CSS precisam acompanhar.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* nao persiste, mas a sessao atual funciona */
    }
  }, [])

  return { theme, setTheme, themes: THEMES }
}
