import type { GetMemoryOverviewCommand, MemoryOverview } from "../../../packages/contracts/memory";
import type { MemoryReader } from "../../../packages/domain/memory-read";
import type { AuthenticatedUserPrincipal } from "../../../packages/domain/write-boundary";
import {
  memoryInstant,
  memoryKind,
  memoryOpaqueId,
  memoryQuery,
  memoryTimeZone,
} from "./memory-validation";

export async function getMemoryOverview(
  command: GetMemoryOverviewCommand,
  principal: AuthenticatedUserPrincipal,
  reader: MemoryReader,
): Promise<MemoryOverview> {
  const userId = memoryOpaqueId(principal.userId, "INVALID_PRINCIPAL");
  const normalized: GetMemoryOverviewCommand = {
    timeZone: memoryTimeZone(command.timeZone),
    now: memoryInstant(command.now),
    ...(memoryQuery(command.query) ? { query: memoryQuery(command.query)! } : {}),
    ...(command.kind ? { kind: memoryKind(command.kind) } : {}),
  };
  return reader.getOverview(userId, normalized);
}
