import {receiveDiagnostic} from '@/lib/comercial/webhook';
export const runtime='nodejs';
export const POST=(request:Request)=>receiveDiagnostic(request);
