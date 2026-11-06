import {it,expect} from 'vitest';
import {readPdfBody} from '@/server/assistant/pdf-input';
it('accepts bounded PDF bytes and rejects disguised files',async()=>{expect(new TextDecoder().decode(await readPdfBody(new Request('http://localhost',{method:'POST',body:'%PDF-1.7\nsynthetic'})))).toContain('%PDF');await expect(readPdfBody(new Request('http://localhost',{method:'POST',body:'not a pdf'}))).rejects.toThrow('FILE_LIMIT');});
it('stops before consuming a declared oversized PDF',async()=>{await expect(readPdfBody(new Request('http://localhost',{method:'POST',body:'%PDF-1.7',headers:{'content-length':'10485761'}}))).rejects.toThrow('FILE_LIMIT');});
