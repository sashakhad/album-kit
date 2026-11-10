import { z } from 'zod';

export const jobOutputSchema = z
  .object({
    takes: z
      .array(
        z.object({
          filename: z.string().min(1),
          outputId: z.string().nullable(),
          downloaded: z.boolean(),
          uploaded: z.boolean(),
        })
      )
      .max(50),
  })
  .strict();

export type JobOutput = z.infer<typeof jobOutputSchema>;
