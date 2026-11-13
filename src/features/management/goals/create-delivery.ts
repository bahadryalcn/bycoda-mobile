import type { HostGoal, HostGoalInput } from "@/domain/types";
import { RemoteHostError } from "@/remote/host-error";

/** One editor owns one receipt; unknown writes never acquire a new identity. */
export class GoalCreateDelivery {
  pending?: HostGoalInput;
  busy = false;

  async submit(input: HostGoalInput, current: () => boolean,
    read: () => Promise<HostGoal[]>,
    write: (goal: HostGoalInput & { expectedAbsent: true }) => Promise<HostGoal>) {
    if (this.busy) throw new Error("Epic creation is already being checked.");
    if (!current()) throw new Error("Reopen the original computer to check this epic creation.");
    this.busy = true;
    let firstDispatch = false;
    try {
      if (this.pending) {
        const goals = await read();
        if (!Array.isArray(goals)) throw new Error("The previous epic creation could not be checked.");
        if (!current()) throw new Error("The selected computer changed. The original epic draft is kept.");
        const recovered = goals.find(goal => goal.id === this.pending!.id);
        if (recovered) {
          if (JSON.stringify(recovered.projectIds) !== JSON.stringify(this.pending.projectIds))
            throw new Error("The previous epic identity has an unexpected project scope.");
          return recovered;
        }
        if (JSON.stringify(input) !== JSON.stringify(this.pending))
          throw new Error("The previous epic creation is unresolved. Keep its original draft.");
      } else {
        this.pending = structuredClone(input);
        firstDispatch = true;
      }
      const created = await write({ ...this.pending, expectedAbsent: true });
      if (!created || created.id !== this.pending.id)
        throw new Error("The epic creation acknowledgement could not be verified.");
      if (!current()) throw new Error("The selected computer changed. The original epic draft is kept.");
      return created;
    } catch (error) {
      if (firstDispatch && error instanceof RemoteHostError && !error.uncertain) this.pending = undefined;
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
