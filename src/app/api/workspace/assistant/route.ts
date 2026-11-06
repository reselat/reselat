import {endpoint,bodyOf} from '@/server/business/http';
import {assistantList,assistantMutate,assistantCommand} from '@/server/assistant/service';
export const GET=endpoint(async(_request,actor)=>assistantList(actor));
export const POST=endpoint(async(request,actor)=>assistantMutate(actor,await bodyOf(request,assistantCommand)));
