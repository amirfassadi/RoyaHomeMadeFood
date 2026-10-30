export type DeliveryPolicy={enabled:boolean;transactional:boolean;marketing:boolean};
export type Campaign={id:string;title:string;body:string;category:string;purpose:string;audience:string;identifier:string|null;preference:string;status:string;notBefore:string;updatedAt:string};
export type CampaignWorkspace={policy:DeliveryPolicy;updatedAt:string|null;campaigns:Campaign[];recent:{id:string;kind:string;title:string;status:string;channel:string|null;errorCode:string|null;createdAt:string;updatedAt:string}[];counts:{status:string;_count:{_all:number}}[]};
