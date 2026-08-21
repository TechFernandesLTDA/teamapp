/**
 * Icones do Windows 95 em pixel art.
 *
 * Sao recriacoes proprias em SVG, nao os arquivos originais da Microsoft: os
 * icones do Windows 95 sao material proprietario e nao podem ser redistribuidos
 * num repositorio publico. O que da a aparencia certa nao e o arquivo, e a
 * disciplina do formato -- grade de 16x16 ou 32x32, um pixel por unidade, e a
 * paleta VGA de 16 cores.
 *
 * Cada icone e um `<svg viewBox="0 0 16 16">` com `shapeRendering="crispEdges"`,
 * que desliga o antialias: sem isso o navegador borra as bordas e o resultado
 * parece um icone moderno desfocado em vez de pixel art.
 *
 * Escalar so em multiplos inteiros (16, 32, 48). Um icone de 16px desenhado em
 * 20px mostra linhas de espessura irregular -- e o detalhe que denuncia a
 * imitacao mais rapido que qualquer outro.
 */

type IconProps = { size?: number; className?: string; title?: string }

/** Paleta VGA de 16 cores -- a mesma que o Windows 95 usava para os icones do shell. */
const C = {
  black: '#000000',
  gray: '#808080',
  silver: '#c0c0c0',
  white: '#ffffff',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  cyan: '#00ffff',
  green: '#008000',
  lime: '#00ff00',
  maroon: '#800000',
  red: '#ff0000',
  olive: '#808000',
  yellow: '#ffff00',
  purple: '#800080',
  magenta: '#ff00ff',
} as const

function Svg({
  size = 16,
  className,
  title,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      // Sem isto o SVG e antialiased e a pixel art vira borrao.
      shapeRendering="crispEdges"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

/** Atalho para um pixel/bloco: `p(x, y, w, h, cor)`. */
const p = (x: number, y: number, w: number, h: number, fill: string, key?: string | number) => (
  <rect key={key ?? `${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill={fill} />
)

/**
 * Lixeira vazia: cesto de tela metalica, tampa por cima.
 * O Windows 95 diferencia vazia de cheia so pelo conteudo saindo da boca --
 * o cesto e identico nos dois estados.
 */
export function TrashEmptyIcon({ size = 32, className, title = 'Lixeira vazia' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {/* tampa */}
      {p(3, 3, 10, 1, C.gray)}
      {p(4, 2, 8, 1, C.silver)}
      {p(6, 1, 4, 1, C.gray)}
      {/* corpo, levemente conico */}
      {p(4, 4, 8, 1, C.white)}
      {p(4, 5, 8, 8, C.silver)}
      {p(4, 5, 1, 8, C.white)}
      {p(11, 5, 1, 8, C.gray)}
      {p(5, 13, 6, 1, C.gray)}
      {/* ripas verticais da tela */}
      {p(6, 6, 1, 7, C.gray)}
      {p(8, 6, 1, 7, C.gray)}
      {p(10, 6, 1, 7, C.gray)}
      {/* contorno */}
      {p(3, 4, 1, 9, C.black)}
      {p(12, 4, 1, 9, C.black)}
      {p(4, 14, 8, 1, C.black)}
    </Svg>
  )
}

/** Lixeira cheia: mesmo cesto, com papel amassado transbordando. */
export function TrashFullIcon({ size = 32, className, title = 'Lixeira cheia' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {/* papel saindo da boca, antes da tampa para ficar por tras */}
      {p(5, 1, 3, 2, C.white)}
      {p(8, 0, 3, 2, C.silver)}
      {p(6, 0, 2, 1, C.silver)}
      {p(9, 2, 2, 1, C.white)}
      {p(4, 2, 1, 1, C.white)}
      {/* tampa, encostada de lado porque o cesto esta cheio */}
      {p(3, 3, 10, 1, C.gray)}
      {p(4, 3, 8, 1, C.silver)}
      {/* corpo */}
      {p(4, 4, 8, 1, C.white)}
      {p(4, 5, 8, 8, C.silver)}
      {p(4, 5, 1, 8, C.white)}
      {p(11, 5, 1, 8, C.gray)}
      {p(5, 13, 6, 1, C.gray)}
      {p(6, 6, 1, 7, C.gray)}
      {p(8, 6, 1, 7, C.gray)}
      {p(10, 6, 1, 7, C.gray)}
      {p(3, 4, 1, 9, C.black)}
      {p(12, 4, 1, 9, C.black)}
      {p(4, 14, 8, 1, C.black)}
    </Svg>
  )
}

/** A bandeira de quatro cores do botao Iniciar, ondulada. */
export function WindowsFlagIcon({ size = 16, className, title }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {/* Cada quadrante e desenhado como duas colunas com alturas diferentes:
          e o que cria a ondulacao da bandeira sem curva de verdade. */}
      {/* vermelho, superior esquerdo */}
      {p(1, 3, 3, 5, C.red)}
      {p(4, 2, 3, 5, C.red)}
      {/* verde, superior direito */}
      {p(8, 1, 3, 5, C.green)}
      {p(11, 1, 3, 5, C.green)}
      {/* azul, inferior esquerdo */}
      {p(1, 9, 3, 5, C.blue)}
      {p(4, 8, 3, 5, C.blue)}
      {/* amarelo, inferior direito */}
      {p(8, 7, 3, 5, C.yellow)}
      {p(11, 7, 3, 5, C.yellow)}
    </Svg>
  )
}

/** Meu Computador: monitor CRT sobre a base, com a tela em ciano. */
export function ComputerIcon({ size = 32, className, title = 'Meu Computador' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {p(2, 2, 12, 9, C.black)}
      {p(3, 3, 10, 7, C.silver)}
      {p(4, 4, 8, 5, C.teal)}
      {p(4, 4, 8, 1, C.cyan)}
      {p(3, 9, 10, 1, C.gray)}
      {/* pescoco e base */}
      {p(6, 11, 4, 1, C.gray)}
      {p(4, 12, 8, 2, C.silver)}
      {p(4, 12, 8, 1, C.white)}
      {p(4, 14, 8, 1, C.black)}
      {p(10, 13, 1, 1, C.green)}
    </Svg>
  )
}

/** Pasta amarela fechada -- a lista, na janela da Lixeira. */
export function FolderIcon({ size = 16, className, title = 'Pasta' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {/* aba */}
      {p(1, 3, 5, 1, C.black)}
      {p(6, 4, 2, 1, C.black)}
      {/* corpo */}
      {p(1, 4, 14, 9, C.yellow)}
      {p(1, 4, 14, 1, C.white)}
      {p(2, 5, 12, 7, C.olive)}
      {p(2, 5, 12, 6, C.yellow)}
      {p(1, 13, 14, 1, C.black)}
      {p(0, 3, 1, 11, C.black)}
      {p(15, 4, 1, 10, C.black)}
    </Svg>
  )
}

/** Documento de texto -- o card, na janela da Lixeira. */
export function DocumentIcon({ size = 16, className, title = 'Documento' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {p(3, 1, 8, 14, C.black)}
      {p(4, 2, 7, 12, C.white)}
      {/* orelha dobrada no canto superior direito */}
      {p(9, 1, 2, 1, C.black)}
      {p(10, 2, 1, 3, C.black)}
      {p(9, 2, 1, 2, C.silver)}
      {/* linhas de texto */}
      {[5, 7, 9, 11].map((y) => p(5, y, 5, 1, C.gray, `l${y}`))}
    </Svg>
  )
}

/** Ampulheta -- estado de carregando. */
export function HourglassIcon({ size = 16, className, title = 'Aguarde' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {p(4, 2, 8, 1, C.black)}
      {p(4, 13, 8, 1, C.black)}
      {p(5, 3, 6, 2, C.white)}
      {p(6, 5, 4, 2, C.silver)}
      {p(7, 7, 2, 2, C.gray)}
      {p(6, 9, 4, 2, C.silver)}
      {p(5, 11, 6, 2, C.white)}
      {/* areia acumulada embaixo */}
      {p(6, 11, 4, 2, C.yellow)}
      {p(5, 3, 1, 10, C.black)}
      {p(10, 3, 1, 10, C.black)}
    </Svg>
  )
}

/** Aviso amarelo -- usado no ConfirmDialog. */
export function WarningIcon({ size = 32, className, title = 'Atencao' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {/* triangulo em degraus: cada linha uma unidade mais larga */}
      {p(7, 1, 2, 1, C.black)}
      {Array.from({ length: 11 }, (_, i) => p(7 - i, 2 + i, 2 + i * 2, 1, C.black, `t${i}`))}
      {p(7, 2, 2, 1, C.yellow)}
      {Array.from({ length: 9 }, (_, i) => p(6 - i, 3 + i, 4 + i * 2, 1, C.yellow, `f${i}`))}
      {/* exclamacao */}
      {p(7, 5, 2, 5, C.black)}
      {p(7, 11, 2, 2, C.black)}
    </Svg>
  )
}

/** Bomba do Campo Minado -- tambem o icone de erro fatal do Win95. */
export function BombIcon({ size = 16, className, title = 'Mina' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {p(6, 4, 5, 1, C.black)}
      {p(4, 5, 9, 2, C.black)}
      {p(3, 7, 11, 5, C.black)}
      {p(4, 12, 9, 1, C.black)}
      {p(6, 13, 5, 1, C.black)}
      {/* brilho especular: e o que faz a esfera parecer redonda */}
      {p(5, 6, 2, 1, C.white)}
      {p(5, 7, 1, 1, C.white)}
      {/* pavio */}
      {p(9, 2, 1, 2, C.gray)}
      {p(10, 1, 2, 1, C.gray)}
      {p(12, 0, 1, 2, C.red)}
    </Svg>
  )
}

/** Bandeira vermelha do Campo Minado. */
export function FlagIcon({ size = 16, className, title = 'Bandeira' }: IconProps) {
  return (
    <Svg size={size} className={className} title={title}>
      {p(7, 2, 1, 7, C.black)}
      {p(3, 3, 4, 1, C.red)}
      {p(2, 4, 5, 1, C.red)}
      {p(3, 5, 4, 1, C.red)}
      {p(4, 6, 3, 1, C.red)}
      {p(5, 9, 5, 1, C.black)}
      {p(4, 10, 7, 1, C.black)}
      {p(3, 11, 9, 2, C.black)}
    </Svg>
  )
}
