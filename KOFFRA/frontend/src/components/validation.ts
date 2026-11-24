import { z } from 'zod'
import { estimatePasswordStrength } from '../crypto'

/** Erreurs de validation par champ : { nomDuChamp: 'message' }. */
export type FieldErrors<T> = Partial<Record<keyof T & string, string>>

/** Valide `values` avec un schéma Zod et renvoie la première erreur de chaque champ (ou null si tout est valide). */
export function validate<T extends Record<string, unknown>>(schema: z.ZodType<T>, values: T): FieldErrors<T> | null {
  const result = schema.safeParse(values)
  if (result.success) return null
  const errors: FieldErrors<T> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '') as keyof T & string
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

export const MIN_PASSWORD_LENGTH = 12

export const rules = {
  email: z.string().trim().min(1, 'Saisissez votre adresse email.').email('Adresse email invalide.'),
  name: z.string().trim().min(2, 'Au moins 2 caractères.').max(120, '120 caractères maximum.'),
  required: (label: string) => z.string().trim().min(1, `${label} est obligatoire.`),
  otp: z.string().trim().regex(/^\d{6}$/, 'Le code contient 6 chiffres.'),
  currentPassword: z.string().min(1, 'Saisissez votre mot de passe.'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Au moins ${MIN_PASSWORD_LENGTH} caractères.`)
    .refine((p) => estimatePasswordStrength(p).label !== 'faible', 'Trop faible : allongez-le (une phrase de plusieurs mots est idéale).'),
}

/** Schéma « nouveau mot de passe + confirmation ». */
export function newPasswordSchema<T extends z.ZodRawShape>(extra: T) {
  return z
    .object({ ...extra, password: rules.newPassword, confirm: z.string() })
    .refine((v) => (v as { password: string }).password === (v as { confirm: string }).confirm, { message: 'Les deux mots de passe ne correspondent pas.', path: ['confirm'] })
}
