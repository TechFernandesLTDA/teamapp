-- Conserta o backfill de Card.createdAt feito pela migration anterior.
--
-- A migration `atividade-e-stats` copiou os cards existentes para a tabela nova
-- sem a coluna `createdAt`, entao cada linha antiga caiu no
-- `DEFAULT CURRENT_TIMESTAMP` do SQLite -- que grava TEXT ("2026-08-21 04:48:19").
-- O Prisma, ao inserir, grava DateTime como INTEGER (ms desde a epoch).
--
-- Isso quebra ORDER BY, nao a leitura: o SQLite ordena por classe de tipo antes
-- do valor (INTEGER < TEXT), entao TODA linha antiga se ordena depois de TODA
-- linha nova, independentemente da data. Na pratica GET /api/stats devolvia como
-- `newestCard` um card do seed em vez do card recem-criado -- e os dois
-- apareciam com a data certa no JSON, o que torna o bug invisivel na resposta.
--
-- A conversao preserva o instante: julianday() interpreta a string como UTC,
-- que e o fuso de CURRENT_TIMESTAMP.
UPDATE "Card"
SET "createdAt" = CAST((julianday("createdAt") - 2440587.5) * 86400000.0 AS INTEGER)
WHERE typeof("createdAt") = 'text';

-- Mesmo tratamento por seguranca no log: `Activity.createdAt` tambem tem
-- DEFAULT CURRENT_TIMESTAMP no schema SQL. Hoje o default nunca dispara (o
-- Prisma sempre manda o valor), mas um INSERT feito na mao pelo sqlite3 criaria
-- a mesma mistura de tipos e o log apareceria fora de ordem.
UPDATE "Activity"
SET "createdAt" = CAST((julianday("createdAt") - 2440587.5) * 86400000.0 AS INTEGER)
WHERE typeof("createdAt") = 'text';
