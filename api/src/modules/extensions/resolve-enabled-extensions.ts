import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { EXTENSION_KEYS } from './extension-registry';

const logger = new Logger('Bootstrap');

/**
 * Lit les extensions activées en DB, AVANT que Nest existe — un
 * `PrismaClient` autonome et de courte durée (pas le `PrismaService`
 * habituel, qui n'est instanciable qu'après `NestFactory.create`).
 * Fail-safe à chaque étape : base non configurée, injoignable, ou table
 * `Extension` pas encore créée (première installation, avant le premier
 * `prisma db push`) => aucune extension active, jamais d'échec de boot.
 */
export async function resolveEnabledExtensions(dbConfigured: boolean): Promise<string[]> {
  if (!dbConfigured || EXTENSION_KEYS.length === 0) return [];

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const rows = await prisma.extension.findMany({ where: { enabled: true }, select: { key: true } });
    return rows.map((r) => r.key).filter((key) => EXTENSION_KEYS.includes(key));
  } catch (e) {
    logger.warn(`Résolution des extensions ignorée (base injoignable ou table absente) : ${e}`);
    return [];
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
