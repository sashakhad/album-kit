import { z } from 'zod';

export const jobOutputSchema = z
  .object({
    takes: z
      .array(
        z.object({
          filename: z.string().min(1),
          outputId: z.string().nullable(),
          clipId: z.string().min(1).nullable().optional(),
          streamUrl: z.string().min(1).nullable().optional(),
          downloaded: z.boolean(),
          uploaded: z.boolean(),
        })
      )
      .max(50),
  })
  .strict();

export type JobOutput = z.infer<typeof jobOutputSchema>;
