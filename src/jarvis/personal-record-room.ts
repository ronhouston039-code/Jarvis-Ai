import { RecordRoom } from 'deepspace/worker'
import type { Env } from '../../worker'
import { memorySchema, reminderSchema } from './contracts'

/** Only verified Worker tools/routes can create private records. Raw realtime writes are denied by schemas. */
export class PersonalRecordRoom extends RecordRoom<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/tools/execute' || request.headers.get('X-App-Action') === 'true') return super.fetch(request)
    const body = await request.clone().json().catch(()=>null) as {tool?:string;params?:{collection?:string;data?:unknown}} | null
    const collection = body?.params?.collection
    if (body?.tool !== 'records.create' || (collection !== 'reminders' && collection !== 'memories')) return super.fetch(request)
    // X-User-Id is set by the Worker after JWT verification. This DO has no public HTTP ingress.
    const userId = request.headers.get('X-User-Id')
    if (!userId || userId.startsWith('anon-')) return Response.json({success:false,error:'unauthorized'},{status:401})
    if (userId !== this.env.OWNER_USER_ID) {
      const membership = await super.fetch(new Request('https://internal/api/tools/execute', {
        method:'POST',headers:{'Content-Type':'application/json','X-User-Id':this.env.OWNER_USER_ID,'X-App-Action':'true'},
        body:JSON.stringify({tool:'records.get',params:{collection:'users',recordId:userId}}),
      }))
      const result = await membership.json() as {success:boolean;data?:{record?:{data?:{role?:string}}}}
      if (!result.success || !['member','admin','viewer'].includes(result.data?.record?.data?.role ?? '')) return Response.json({success:false,error:'forbidden'},{status:403})
    }
    const parsed = (collection==='reminders'?reminderSchema:memorySchema).safeParse(body.params?.data)
    if (!parsed.success) return Response.json({success:false,error:'invalid_fields'},{status:422})
    const data:Record<string,unknown> = {...parsed.data,userId}
    if (typeof data.dueAt==='string') data.dueAt=new Date(data.dueAt).toISOString()
    const headers=new Headers(request.headers);headers.set('X-App-Action','true')
    // Construct an exact create operation; supplied record IDs/tool names cannot survive validation.
    return super.fetch(new Request(request.url,{method:'POST',headers,body:JSON.stringify({tool:'records.create',params:{collection,data}})}))
  }
}
