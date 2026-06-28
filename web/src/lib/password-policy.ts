// Single source of the client-side password rules shown in the AuthForm checklist.
// These MUST mirror the Cognito User Pool PasswordPolicy in infra/workspace/cognito.yaml
// (MinimumLength 8, RequireUppercase, RequireLowercase, RequireNumbers). The static
// frontend cannot read the pool's policy, so keep the two in sync by hand.

export interface PasswordCriteria {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
}

export interface CriterionDef {
  key: keyof PasswordCriteria;
  label: string;
  test: (pw: string) => boolean;
}

// Order here is the checklist display order.
export const PASSWORD_CRITERIA: CriterionDef[] = [
  { key: "length", label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "A lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", label: "A number", test: (pw) => /[0-9]/.test(pw) },
];

export function passwordCriteria(pw: string): PasswordCriteria {
  return PASSWORD_CRITERIA.reduce((acc, c) => {
    acc[c.key] = c.test(pw);
    return acc;
  }, {} as PasswordCriteria);
}

export function allCriteriaMet(pw: string): boolean {
  return PASSWORD_CRITERIA.every((c) => c.test(pw));
}
