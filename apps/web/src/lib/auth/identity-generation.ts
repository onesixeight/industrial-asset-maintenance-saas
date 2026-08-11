export interface IdentityGeneration {
  generation: number;
  signal: AbortSignal;
}

let generation = 0;
let transitionController = new AbortController();
const requestControllers = new Set<AbortController>();

export function beginIdentityGeneration(): IdentityGeneration {
  generation += 1;
  transitionController.abort();
  for (const controller of requestControllers) controller.abort();
  requestControllers.clear();
  transitionController = new AbortController();
  return { generation, signal: transitionController.signal };
}

export function captureIdentityGeneration(): IdentityGeneration {
  return { generation, signal: transitionController.signal };
}

export function isCurrentIdentityGeneration(expected: number): boolean {
  return expected === generation;
}

export function registerIdentityRequest(callerSignal?: AbortSignal | null): {
  signal: AbortSignal;
  release: () => void;
} {
  const requestController = new AbortController();
  requestControllers.add(requestController);
  const signals = [transitionController.signal, requestController.signal];
  if (callerSignal) signals.push(callerSignal);
  return {
    signal: AbortSignal.any(signals),
    release: () => requestControllers.delete(requestController),
  };
}
