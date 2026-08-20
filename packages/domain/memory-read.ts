import type { GetMemoryOverviewCommand, MemoryOverview } from "../contracts/memory";

export interface MemoryReader {
  getOverview(authenticatedUserId: string, command: GetMemoryOverviewCommand): Promise<MemoryOverview>;
}
