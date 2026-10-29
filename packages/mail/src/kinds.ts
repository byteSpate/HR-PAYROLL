/** Every kind of email this Part sends. Part E adds the decision mails. */
export type DispatchKind =
  | 'CREDENTIALS'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_CHANGE_WARNING'
  | 'EMAIL_CHANGE_CONFIRM'
  | 'EMAIL_CHANGED'
  | 'PAYSLIP'
  | 'SETTLEMENT_STATEMENT';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  kind: DispatchKind;
  entity?: string;
  entityId?: string;
  attachments?: MailAttachment[];
}

export interface SendMailResult {
  dispatchId: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
}
