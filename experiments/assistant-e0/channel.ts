export type Binding={companyId:string;accountId:string;conversationId:string};
export type Message={binding:Binding;externalId:string;text:string;occurredAt:string};
export type SendAttempt={id:string;binding:Binding;takeoverVersion:number;text:string};
export type Receipt={attemptId:string;state:'sent'|'rejected'|'unknown';externalId?:string};
