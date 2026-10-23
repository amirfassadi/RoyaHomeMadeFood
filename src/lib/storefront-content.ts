import {z} from 'zod';
import fa from '../../messages/fa.json';
import en from '../../messages/en.json';

const line=(max:number)=>z.string().trim().min(1).max(max);
export const localizedContentSchema=z.object({
  slogan:line(180),
  homeEyebrow:line(120),
  homeTitle1:line(180),
  homeTitle2:line(180),
  homeIntro:line(2000),
  homeAboutTitle:line(180),
  homeAboutText:line(3000),
  aboutTitle:line(180),
  aboutIntro:line(2000),
  aboutStoryTitle:line(180),
  aboutStory:line(4000),
  footerText:line(1000),
}).strict();
export const storefrontContentSchema=z.object({fa:localizedContentSchema,en:localizedContentSchema}).strict();
export const contentDocumentSchema=z.object({content:storefrontContentSchema,updatedAt:z.iso.datetime()}).strict();
export const contentEditSchema=z.object({content:storefrontContentSchema,expectedUpdatedAt:z.iso.datetime()}).strict();
export type LocalizedContent=z.infer<typeof localizedContentSchema>;
export type ContentDocument=z.infer<typeof contentDocumentSchema>;
export type ContentEdit=z.infer<typeof contentEditSchema>;
export type ContentLocale='fa'|'en';
export const CONTENT_INITIAL_VERSION='1970-01-01T00:00:00.000Z';

function defaults(messages:typeof fa|typeof en):LocalizedContent{
  return {
    slogan:messages.Brand.slogan,homeEyebrow:messages.Home.eyebrow,
    homeTitle1:messages.Home.title1,homeTitle2:messages.Home.title2,homeIntro:messages.Home.intro,
    homeAboutTitle:messages.Home.aboutTitle,homeAboutText:messages.Home.aboutText,
    aboutTitle:messages.About.title,aboutIntro:messages.About.intro,
    aboutStoryTitle:messages.About.storyTitle,aboutStory:messages.About.story,footerText:messages.Nav.footer,
  };
}
export function defaultContentDocument():ContentDocument{
  return {content:{fa:defaults(fa),en:defaults(en)},updatedAt:CONTENT_INITIAL_VERSION};
}
export const contentFields:ReadonlyArray<{key:keyof LocalizedContent;label:string;group:'home'|'about'|'footer';max:number;rows?:number}>=[
  {key:'slogan',label:'شعار رویا',group:'home',max:180},
  {key:'homeEyebrow',label:'متن بالای عنوان اصلی',group:'home',max:120},
  {key:'homeTitle1',label:'عنوان اصلی — خط اول',group:'home',max:180},
  {key:'homeTitle2',label:'عنوان اصلی — خط دوم',group:'home',max:180},
  {key:'homeIntro',label:'معرفی صفحهٔ اصلی',group:'home',max:2000,rows:4},
  {key:'homeAboutTitle',label:'عنوان بخش معرفی رویا',group:'home',max:180},
  {key:'homeAboutText',label:'متن بخش معرفی رویا',group:'home',max:3000,rows:5},
  {key:'aboutTitle',label:'عنوان دربارهٔ ما',group:'about',max:180},
  {key:'aboutIntro',label:'معرفی دربارهٔ ما',group:'about',max:2000,rows:4},
  {key:'aboutStoryTitle',label:'عنوان داستان رویا',group:'about',max:180},
  {key:'aboutStory',label:'داستان رویا',group:'about',max:4000,rows:6},
  {key:'footerText',label:'متن پایین صفحه',group:'footer',max:1000,rows:3},
];
