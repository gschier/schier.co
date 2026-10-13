import { randomInt } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

// Queries go through DATABASE_URL. The pg driver adapter is compatible with
// transaction pooling as long as nothing relies on session state, which
// Prisma does not.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const db = new PrismaClient({ adapter })

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/// An id as the Go site made them: a prefix (pst_, usr_, ses_, sub_, snd_)
/// and twelve random letters and digits, 16 characters in a VARCHAR(25).
export function newId(prefix: 'pst_' | 'usr_' | 'ses_' | 'sub_' | 'snd_'): string {
  let id = prefix
  for (let i = 0; i < 12; i++) id += LETTERS[randomInt(LETTERS.length)]
  return id
}
