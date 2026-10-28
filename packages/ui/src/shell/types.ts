/** Who is signed in, as the sidebar footer and the account menu show them. */
export interface ShellIdentity {
  name: string
  email: string
  avatarUrl?: string | null
  /** Under the name: the person's designation or role. */
  subtitle: string
  /** The role badge in the account menu. */
  roleLabel: string
  loading?: boolean
}
