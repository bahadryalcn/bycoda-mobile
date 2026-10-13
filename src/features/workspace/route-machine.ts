/** A route keeps its origin for its entire lifetime, including manual links. */
export class RouteMachine {
  constructor(readonly origin: string | null) {}
  matches(active: string | null) {
    return this.origin !== null && active === this.origin;
  }
}
