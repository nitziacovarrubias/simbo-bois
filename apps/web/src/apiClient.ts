import type { DesignDocument } from '@simbo/design-domain';
import {
  CreateDesignChangeProposalRequestSchema,
  CreateDesignChangeProposalResponseSchema,
  DesignChangeProposalParamsSchema,
  GenerateCuttingListParamsSchema,
  CuttingListResponseSchema,
  CuttingListAuthorizationResponseSchema,
  CuttingListAuthorizationStatusResponseSchema,
  RevisionRequestSchema,
  type CuttingListResponse,
  type CuttingListAuthorizationResponse,
  type CuttingListAuthorizationStatusResponse
  ListDesignChangeProposalsResponseSchema,
  type CuttingListResponse,
  type CreateDesignChangeProposalResponse,
  type ListDesignChangeProposalsResponse
} from '@simbo/shared-contracts';

export interface SessionUser { id:string;name:string;email:string;role:'ARCHITECT'|'SUPERVISOR'; }
export interface ProjectSummary { id:string;name:string;ownerId:string|null;updatedAt:string; }
export interface DesignResponse { design:DesignDocument;revision:number;persisted:boolean;approvedVersionId:string|null; }
export interface VersionSummary { id:string;revision:number;approvalStatus:'DRAFT'|'APPROVED';approvedAt:string|null;approvedById:string|null;current:boolean;createdAt:string; }
export class ApiError extends Error { constructor(public readonly status:number,message:string){super(message);} }
const KEY='simbo.session.pre-cu07';
let token:string|undefined;
try { token=sessionStorage.getItem(KEY)??undefined; } catch { /* Sesión sólo en memoria si almacenamiento no está disponible. */ }
function clearSession():void { token=undefined;try{sessionStorage.removeItem(KEY);}catch{/* sesión en memoria */} }
async function request<T>(path:string,body?:unknown):Promise<T> {
  let response:Response;
  try {response=await fetch(`${import.meta.env.VITE_API_URL??'http://localhost:3001/api'}${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch {throw new ApiError(0,'No se pudo conectar con el servidor');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok) {
    if(response.status===401&&path!=='/auth/login'){clearSession();window.dispatchEvent(new Event('simbo.session.expired'));}
    throw new ApiError(response.status,typeof data.message==='string'?data.message:`Error HTTP ${response.status}`);
  }
  return data as T;
}
export const apiClient={
  hasSession:()=>Boolean(token),
  clearSession,
  async login(email:string,password:string):Promise<SessionUser>{
    const session=await request<{token:string;user:SessionUser}>('/auth/login',{email,password});token=session.token;
    try{sessionStorage.setItem(KEY,token);}catch{/* sesión en memoria */}return session.user;
  },
  me:()=>request<SessionUser>('/auth/me'),
  async logout():Promise<void>{try{await request('/auth/logout',{});}finally{clearSession();}},
  projects:()=>request<ProjectSummary[]>('/projects'),
  createProject:(name:string)=>request<ProjectSummary>('/projects',{name}),
  design:(id:string)=>request<DesignResponse>(`/projects/${encodeURIComponent(id)}/design`),
  saveDesign:(id:string,design:DesignDocument,expectedRevision:number)=>request<{revision:number}>(`/projects/${encodeURIComponent(id)}/design`,{design,expectedRevision}),
  versions:(id:string)=>request<VersionSummary[]>(`/projects/${encodeURIComponent(id)}/versions`),
  createVersion:(id:string,expectedRevision:number)=>request<{id:string;revision:number}>(`/projects/${encodeURIComponent(id)}/versions`,{expectedRevision}),
  approve:(id:string,versionId:string,expectedRevision:number)=>request(`/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/approve`,{expectedRevision}),
  async createProposal(projectId:string,versionId:string,observation:string):Promise<CreateDesignChangeProposalResponse>{
    const params=DesignChangeProposalParamsSchema.parse({projectId,versionId});
    const body=CreateDesignChangeProposalRequestSchema.parse({observation});
    const response=await request<unknown>(
      `/projects/${encodeURIComponent(params.projectId)}/versions/${encodeURIComponent(params.versionId)}/proposals`,
      body
    );
    return CreateDesignChangeProposalResponseSchema.parse(response);
  },
  async listProposals(projectId:string,versionId:string):Promise<ListDesignChangeProposalsResponse>{
    const params=DesignChangeProposalParamsSchema.parse({projectId,versionId});
    const response=await request<unknown>(
      `/projects/${encodeURIComponent(params.projectId)}/versions/${encodeURIComponent(params.versionId)}/proposals`
    );
    return ListDesignChangeProposalsResponseSchema.parse(response);
  },
  async generateCuttingList(
    projectId: string,
    designVersionId: string
  ): Promise<CuttingListResponse> {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId, designVersionId
    });
    const path = `/projects/${encodeURIComponent(params.projectId)}`
      + `/versions/${encodeURIComponent(params.designVersionId)}/cutting-list`;
    const response = await request<unknown>(path, {});
    return CuttingListResponseSchema.parse(response);
  },
  async authorizeCuttingList(
    projectId: string,
    designVersionId: string,
    expectedRevision: number
  ): Promise<CuttingListAuthorizationResponse> {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId,
      designVersionId
    });
    const body = RevisionRequestSchema.parse({ expectedRevision });
    const path = `/projects/${encodeURIComponent(params.projectId)}`
      + `/versions/${encodeURIComponent(params.designVersionId)}/cutting-list/authorize`;
    const response = await request<unknown>(path, body);
    return CuttingListAuthorizationResponseSchema.parse(response);
  },
  async getCuttingListAuthorization(
    projectId: string,
    designVersionId: string
  ): Promise<CuttingListAuthorizationStatusResponse> {
    const params = GenerateCuttingListParamsSchema.parse({
      projectId,
      designVersionId
    });
    const path = `/projects/${encodeURIComponent(params.projectId)}`
      + `/versions/${encodeURIComponent(params.designVersionId)}/cutting-list/authorization`;
    const response = await request<unknown>(path);
    return CuttingListAuthorizationStatusResponseSchema.parse(response);
  }
};
