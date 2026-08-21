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

  // Um item ja na lixeira: deixa a feature demonstravel num stack novo e serve
  // de conferencia de que o GET /api/board realmente esconde o que foi jogado fora.
  const inbox = await prisma.list.findFirst({ where: { boardId: board.id }, orderBy: { position: 'asc' } })
  if (inbox) {
    await prisma.card.create({
      data: {
        listId: inbox.id,
        title: 'Trabalho de Estagio.doc',
        description: 'Apagado por engano em 1997.',
        position: 99,
        deletedAt: new Date(),
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
