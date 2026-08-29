import { z } from "zod";

const requiredId = (label: string) =>
  z.string().uuid({ error: `${label} is invalid.` });

const formBoolean = z.enum(["true", "false"], {
  error: "Choose a valid status.",
}).transform((value) => value === "true");

export const gameIdSchema = z.object({
  game_id: requiredId("Game"),
});

export const createGameSchema = z.object({
  name: z.string().trim().max(80, "Game name must be 80 characters or fewer.").optional(),
  setup: z.union([z.literal("custom"), z.uuid("Choose a valid game setup.")]),
  players: z.coerce.number({ error: "Choose between 3 and 30 players for a custom game." }).int().min(3).max(30).optional(),
});

export const joinGameSchema = z.object({
  code: z.string().trim().toUpperCase().regex(
    /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/,
    "Enter a valid 6-character invite code.",
  ),
});

export const joinGameByIdSchema = gameIdSchema.extend({
  code: z.string().trim().toUpperCase().optional(),
});

export const readyStatusSchema = gameIdSchema.extend({ ready: formBoolean });
export const playerManagementSchema = gameIdSchema.extend({
  player_id: requiredId("Player"),
});
export const mutePlayerSchema = playerManagementSchema.extend({ mute: formBoolean });
export const pauseGameSchema = gameIdSchema.extend({ pause: formBoolean });

const optionalTarget = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || value === "skip" || value === "abstain" || z.uuid().safeParse(value).success,
    "Choose a valid target.",
  );

export const roleActionSchema = gameIdSchema.extend({ target_id: optionalTarget });
export const voteSchema = gameIdSchema.extend({ target_id: optionalTarget });
export const chatMessageSchema = gameIdSchema.extend({
  room_id: requiredId("Chat room"),
  body: z.string().trim().min(1, "Type a message first.").max(500, "Messages are limited to 500 characters."),
});

export const roleLimitSchema = z.union([
  z.literal("unlimited").transform(() => null),
  z.coerce.number().int().min(0).max(99),
]);

export function formDataValues(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

export function validationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the information you entered.";
}
