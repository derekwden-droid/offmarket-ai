import { EventSchemas, Inngest } from "inngest";

/**
 * Typed Inngest event catalog.
 *
 * Every background job is triggered by one of these events. Declaring the
 * payloads here gives `inngest.send(...)` and the function `event` argument full
 * type-safety end to end — no `any`, no untyped event data.
 */
type SkipTraceJobRequested = {
  data: {
    /** The `SkipTraceJob` row id created at enqueue time. */
    jobId: string;
    /** Property ids to resolve owner contact details for. */
    propertyIds: string[];
    /** Bounded in-flight provider calls (1–20). */
    concurrency: number;
  };
};

type TestHelloWorld = {
  data: {
    /** Arbitrary marker echoed back through the durable run for verification. */
    marker: string;
  };
};

export type AppEvents = {
  "skip-trace/job.requested": SkipTraceJobRequested;
  "test/hello.world": TestHelloWorld;
};

/**
 * The Inngest client. `INNGEST_EVENT_KEY` (send) and `INNGEST_SIGNING_KEY`
 * (serve) are read from the environment by the SDK in production; the local dev
 * server needs neither. The id namespaces this app's functions and events.
 */
export const inngest = new Inngest({
  id: "offmarket-ai",
  schemas: new EventSchemas().fromRecord<AppEvents>(),
});
