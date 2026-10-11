export type Announcement={id:string;titleFa:string;titleEn:string;bodyFa:string;bodyEn:string;startsAt:string|null;expiresAt:string|null;active:boolean;updatedAt:string};
export type ContactInbox={messages:{id:string;name:string;mobile:string;message:string;locale:string;readAt:string|null;createdAt:string}[];announcements:Announcement[];page:number;totalPages:number;unread:number};
