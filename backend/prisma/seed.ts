import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SEED = [
  { title: 'A Fazer', cards: ['Instalar o Windows 95', 'Desfragmentar o disco C:', 'Gravar um CD-R'] },
  { title: 'Fazendo', cards: ['Discar para a internet'] },
  { title: 'Feito', cards: ['Jogar Campo Minado'] },
]

async function main() {
  // Idempotente: se o board default ja existe, nao mexe em nada.
  const existing = await prisma.board.findUnique({ where: { slug: 'default' } })
  if (existing) {
    console.log('board default ja existe, seed ignorado')
    return
  }

  const board = await prisma.board.create({
    data: { slug: 'default', title: 'Meu Board' },
  })

  for (const [i, list] of SEED.entries()) {
    await prisma.list.create({
      data: {
        title: list.title,
        position: i,
        boardId: board.id,
        cards: { create: list.cards.map((title, j) => ({ title, position: j })) },
      },
    })
  }

  console.log('seed ok')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
