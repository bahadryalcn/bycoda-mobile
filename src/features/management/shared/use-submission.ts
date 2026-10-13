import { useAsyncAction } from "@/state/actions";

export function useSubmission(onError: (error: unknown) => void) {
  const submission = useAsyncAction();
  return {
    busy: submission.isPending,
    run: (action: () => Promise<unknown>) =>
      submission.run(async () => {
        try {
          return await action();
        } catch (error) {
          onError(error);
          throw error;
        }
      }),
  };
}
