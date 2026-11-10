
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "_mirai_migrations": {
                  Row: {
                    "applied_at": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string,"name": string
                  }
                  Update: {
                    "applied_at"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"account_events": {
                  Row: {
                    "created_at": string,"detail": NonNullable<Json>,"id": number,"ip": string | null,"kind": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"ip"?: string | null,"kind": string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"ip"?: string | null,"kind"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"accountant_notes": {
                  Row: {
                    "autor": string,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"share_id": string,"texto": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor": string,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"share_id": string,"texto": string,"updated_at"?: string
                  }
                  Update: {
                    "autor"?: string,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"share_id"?: string,"texto"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accountant_notes_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "accountant_notes_share_id_fkey"
      columns: ["share_id"]
isOneToOne: false
      referencedRelation: "accountant_shares"
      referencedColumns: ["id"]
    }
                  ]
                },"accountant_shares": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"email": string,"expires_at": string | null,"id": string,"label": string,"last_access": string | null,"perms": string,"revoked_at": string | null,"token_hash": string,"updated_at": string,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string | null,"id"?: string,"label": string,"last_access"?: string | null,"perms"?: string,"revoked_at"?: string | null,"token_hash": string,"updated_at"?: string,"views"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"last_access"?: string | null,"perms"?: string,"revoked_at"?: string | null,"token_hash"?: string,"updated_at"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "accountant_shares_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"ad_campaigns": {
                  Row: {
                    "anunciante": string,"created_at": string,"desde": string | null,"dispositivos": (string)[],"estado": string,"frecuencia_max": number,"hasta": string | null,"id": string,"modelo_cobro": string,"nombre": string,"objetivo": string,"planes": (string)[],"presupuesto": number | null,"prioridad": number,"tarifa": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anunciante"?: string,"created_at"?: string,"desde"?: string | null,"dispositivos"?: (string)[],"estado"?: string,"frecuencia_max"?: number,"hasta"?: string | null,"id"?: string,"modelo_cobro"?: string,"nombre": string,"objetivo"?: string,"planes"?: (string)[],"presupuesto"?: number | null,"prioridad"?: number,"tarifa"?: number,"updated_at"?: string
                  }
                  Update: {
                    "anunciante"?: string,"created_at"?: string,"desde"?: string | null,"dispositivos"?: (string)[],"estado"?: string,"frecuencia_max"?: number,"hasta"?: string | null,"id"?: string,"modelo_cobro"?: string,"nombre"?: string,"objetivo"?: string,"planes"?: (string)[],"presupuesto"?: number | null,"prioridad"?: number,"tarifa"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ad_events": {
                  Row: {
                    "ad_id": string,"cierres": number,"clics": number,"dia": string,"slot": string,"vistas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ad_id": string,"cierres"?: number,"clics"?: number,"dia"?: string,"slot": string,"vistas"?: number
                  }
                  Update: {
                    "ad_id"?: string,"cierres"?: number,"clics"?: number,"dia"?: string,"slot"?: string,"vistas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ad_events_ad_id_fkey"
      columns: ["ad_id"]
isOneToOne: false
      referencedRelation: "ads"
      referencedColumns: ["id"]
    }
                  ]
                },"ad_user_daily": {
                  Row: {
                    "ad_id": string,"cierres": number,"clics": number,"dia": string,"user_id": string,"vistas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ad_id": string,"cierres"?: number,"clics"?: number,"dia"?: string,"user_id": string,"vistas"?: number
                  }
                  Update: {
                    "ad_id"?: string,"cierres"?: number,"clics"?: number,"dia"?: string,"user_id"?: string,"vistas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ad_user_daily_ad_id_fkey"
      columns: ["ad_id"]
isOneToOne: false
      referencedRelation: "ads"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_audit": {
                  Row: {
                    "accion": string,"actor": string | null,"created_at": string,"detalle": NonNullable<Json>,"id": number,"objetivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accion": string,"actor"?: string | null,"created_at"?: string,"detalle"?: NonNullable<Json>,"id"?: never,"objetivo"?: string | null
                  }
                  Update: {
                    "accion"?: string,"actor"?: string | null,"created_at"?: string,"detalle"?: NonNullable<Json>,"id"?: never,"objetivo"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"admin_notes": {
                  Row: {
                    "autor": string | null,"created_at": string,"id": string,"texto": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor"?: string | null,"created_at"?: string,"id"?: string,"texto": string,"user_id": string
                  }
                  Update: {
                    "autor"?: string | null,"created_at"?: string,"id"?: string,"texto"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ads": {
                  Row: {
                    "activo": boolean,"anunciante": string,"campaign_id": string | null,"created_at": string,"cta": string,"desde": string | null,"formato": string,"hasta": string | null,"id": string,"imagen": string | null,"media": NonNullable<Json>,"prioridad": number,"texto": string,"titulo": string,"ubicaciones": (string)[],"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"anunciante"?: string,"campaign_id"?: string | null,"created_at"?: string,"cta"?: string,"desde"?: string | null,"formato"?: string,"hasta"?: string | null,"id"?: string,"imagen"?: string | null,"media"?: NonNullable<Json>,"prioridad"?: number,"texto"?: string,"titulo": string,"ubicaciones"?: (string)[],"updated_at"?: string,"url": string
                  }
                  Update: {
                    "activo"?: boolean,"anunciante"?: string,"campaign_id"?: string | null,"created_at"?: string,"cta"?: string,"desde"?: string | null,"formato"?: string,"hasta"?: string | null,"id"?: string,"imagen"?: string | null,"media"?: NonNullable<Json>,"prioridad"?: number,"texto"?: string,"titulo"?: string,"ubicaciones"?: (string)[],"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ads_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "ad_campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"advisor_consultations": {
                  Row: {
                    "book_id": string,"contact_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"descripcion": string,"fecha": string,"id": string,"payload": NonNullable<Json>,"tipo": string,"updated_at": string,"valor": number,"veredicto": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"payload"?: NonNullable<Json>,"tipo": string,"updated_at"?: string,"valor"?: number,"veredicto": string
                  }
                  Update: {
                    "book_id"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"payload"?: NonNullable<Json>,"tipo"?: string,"updated_at"?: string,"valor"?: number,"veredicto"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "advisor_consultations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "advisor_consultations_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_cache": {
                  Row: {
                    "created_at": string,"expires_at": string,"feature": string,"hits": number,"household_id": string | null,"key": string,"result": NonNullable<Json>,"tokens": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"feature": string,"hits"?: number,"household_id"?: string | null,"key": string,"result": NonNullable<Json>,"tokens"?: number
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"feature"?: string,"hits"?: number,"household_id"?: string | null,"key"?: string,"result"?: NonNullable<Json>,"tokens"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_cache_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "book_id": string | null,"cached_tokens": number,"costo_cop": number | null,"costo_real": boolean,"costo_usd": number,"created_at": string,"creditos": number,"de_plataforma": boolean,"duracion_ms": number,"error": string | null,"feature": string,"fuente": string,"household_id": string | null,"id": string,"input_tokens": number,"model": string | null,"ok": boolean,"output_tokens": number,"plan": string | null,"provider": string | null,"tokens_evitados": number,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id"?: string | null,"cached_tokens"?: number,"costo_cop"?: number | null,"costo_real"?: boolean,"costo_usd"?: number,"created_at"?: string,"creditos"?: number,"de_plataforma"?: boolean,"duracion_ms"?: number,"error"?: string | null,"feature": string,"fuente"?: string,"household_id"?: string | null,"id"?: string,"input_tokens"?: number,"model"?: string | null,"ok"?: boolean,"output_tokens"?: number,"plan"?: string | null,"provider"?: string | null,"tokens_evitados"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "book_id"?: string | null,"cached_tokens"?: number,"costo_cop"?: number | null,"costo_real"?: boolean,"costo_usd"?: number,"created_at"?: string,"creditos"?: number,"de_plataforma"?: boolean,"duracion_ms"?: number,"error"?: string | null,"feature"?: string,"fuente"?: string,"household_id"?: string | null,"id"?: string,"input_tokens"?: number,"model"?: string | null,"ok"?: boolean,"output_tokens"?: number,"plan"?: string | null,"provider"?: string | null,"tokens_evitados"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_usage_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"allowance_movements": {
                  Row: {
                    "allowance_id": string,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"descripcion": string,"fecha": string,"id": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allowance_id": string,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "allowance_id"?: string,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowance_movements_allowance_id_fkey"
      columns: ["allowance_id"]
isOneToOne: false
      referencedRelation: "allowances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_movements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"allowances": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"frec": string,"id": string,"member_id": string,"mesada": number,"meta_nombre": string,"meta_valor": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"frec"?: string,"id"?: string,"member_id": string,"mesada"?: number,"meta_nombre"?: string,"meta_valor"?: number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"frec"?: string,"id"?: string,"member_id"?: string,"mesada"?: number,"meta_nombre"?: string,"meta_valor"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowances_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowances_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    }
                  ]
                },"api_idempotency": {
                  Row: {
                    "created_at": string,"expires_at": string,"fingerprint": string,"key": string,"response": Json | null,"route": string,"status": number | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"fingerprint": string,"key": string,"response"?: Json | null,"route": string,"status"?: number | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"fingerprint"?: string,"key"?: string,"response"?: Json | null,"route"?: string,"status"?: number | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"assets": {
                  Row: {
                    "book_id": string,"cod": string,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"id": string,"nombre": string,"saldo_at": string | null,"saldo_base": number | null,"saldo_fecha": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cod"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"nombre": string,"saldo_at"?: string | null,"saldo_base"?: number | null,"saldo_fecha"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"cod"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"nombre"?: string,"saldo_at"?: string | null,"saldo_base"?: number | null,"saldo_fecha"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"doc_key": string | null,"id": string,"mime": string,"nombre": string,"path": string,"ref_id": string | null,"ref_table": string | null,"size": number,"updated_at": string,"visible_contador": boolean,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"doc_key"?: string | null,"id"?: string,"mime"?: string,"nombre": string,"path": string,"ref_id"?: string | null,"ref_table"?: string | null,"size"?: number,"updated_at"?: string,"visible_contador"?: boolean,"year"?: number | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"doc_key"?: string | null,"id"?: string,"mime"?: string,"nombre"?: string,"path"?: string,"ref_id"?: string | null,"ref_table"?: string | null,"size"?: number,"updated_at"?: string,"visible_contador"?: boolean,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "accion": string,"actor": string | null,"book_id": string | null,"cambios": Json | null,"created_at": string,"household_id": string | null,"id": number,"resumen": string | null,"row_id": string | null,"tabla": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accion": string,"actor"?: string | null,"book_id"?: string | null,"cambios"?: Json | null,"created_at"?: string,"household_id"?: string | null,"id"?: never,"resumen"?: string | null,"row_id"?: string | null,"tabla": string
                  }
                  Update: {
                    "accion"?: string,"actor"?: string | null,"book_id"?: string | null,"cambios"?: Json | null,"created_at"?: string,"household_id"?: string | null,"id"?: never,"resumen"?: string | null,"row_id"?: string | null,"tabla"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_events": {
                  Row: {
                    "book_id": string,"created_at": string,"datos": NonNullable<Json>,"id": string,"intentos": number,"procesado_at": string | null,"row_id": string | null,"tabla": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"datos"?: NonNullable<Json>,"id"?: string,"intentos"?: number,"procesado_at"?: string | null,"row_id"?: string | null,"tabla": string,"tipo": string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"datos"?: NonNullable<Json>,"id"?: string,"intentos"?: number,"procesado_at"?: string | null,"row_id"?: string | null,"tabla"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_events_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"automation_runs": {
                  Row: {
                    "automation_id": string,"book_id": string,"clave": string,"created_at": string,"deleted_at": string | null,"disparador": string,"error": string | null,"estado": string,"evento": NonNullable<Json>,"id": string,"pasos": NonNullable<Json>,"pendientes": Json | null,"reanudar_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "automation_id": string,"book_id": string,"clave": string,"created_at"?: string,"deleted_at"?: string | null,"disparador"?: string,"error"?: string | null,"estado"?: string,"evento"?: NonNullable<Json>,"id"?: string,"pasos"?: NonNullable<Json>,"pendientes"?: Json | null,"reanudar_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "automation_id"?: string,"book_id"?: string,"clave"?: string,"created_at"?: string,"deleted_at"?: string | null,"disparador"?: string,"error"?: string | null,"estado"?: string,"evento"?: NonNullable<Json>,"id"?: string,"pasos"?: NonNullable<Json>,"pendientes"?: Json | null,"reanudar_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_runs_automation_id_fkey"
      columns: ["automation_id"]
isOneToOne: false
      referencedRelation: "automations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "automation_runs_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"automations": {
                  Row: {
                    "activo": boolean,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"descripcion": string,"disparador": string,"ejecuciones": number,"grafo": NonNullable<Json>,"icon": string,"id": string,"nombre": string,"plantilla": string | null,"ultima_ejecucion": string | null,"ultimo_estado": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"disparador"?: string,"ejecuciones"?: number,"grafo"?: NonNullable<Json>,"icon"?: string,"id"?: string,"nombre": string,"plantilla"?: string | null,"ultima_ejecucion"?: string | null,"ultimo_estado"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"disparador"?: string,"ejecuciones"?: number,"grafo"?: NonNullable<Json>,"icon"?: string,"id"?: string,"nombre"?: string,"plantilla"?: string | null,"ultima_ejecucion"?: string | null,"ultimo_estado"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automations_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"backups": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"id": string,"path": string,"size": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"path": string,"size"?: number,"tipo"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"path"?: string,"size"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "backups_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"book_settings": {
                  Row: {
                    "alerta_pres": number,"anticipo": number,"apps": NonNullable<Json>,"book_id": string,"corte_q": number,"defaults": NonNullable<Json>,"emerg_meta": number,"estricto": string,"gami": boolean,"ia": NonNullable<Json>,"limite": number,"meta": string,"meta_cfg": NonNullable<Json>,"nomina": NonNullable<Json>,"notif": NonNullable<Json>,"pct": NonNullable<Json>,"relaciones": (string)[],"setup": NonNullable<Json>,"smmlv": NonNullable<Json>,"trm": NonNullable<Json>,"trm_auto": boolean,"umbral": number,"updated_at": string,"usura": number,"usura_auto": boolean,"uvt": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "alerta_pres"?: number,"anticipo"?: number,"apps"?: NonNullable<Json>,"book_id": string,"corte_q"?: number,"defaults"?: NonNullable<Json>,"emerg_meta"?: number,"estricto"?: string,"gami"?: boolean,"ia"?: NonNullable<Json>,"limite"?: number,"meta"?: string,"meta_cfg"?: NonNullable<Json>,"nomina"?: NonNullable<Json>,"notif"?: NonNullable<Json>,"pct"?: NonNullable<Json>,"relaciones"?: (string)[],"setup"?: NonNullable<Json>,"smmlv"?: NonNullable<Json>,"trm"?: NonNullable<Json>,"trm_auto"?: boolean,"umbral"?: number,"updated_at"?: string,"usura"?: number,"usura_auto"?: boolean,"uvt"?: NonNullable<Json>
                  }
                  Update: {
                    "alerta_pres"?: number,"anticipo"?: number,"apps"?: NonNullable<Json>,"book_id"?: string,"corte_q"?: number,"defaults"?: NonNullable<Json>,"emerg_meta"?: number,"estricto"?: string,"gami"?: boolean,"ia"?: NonNullable<Json>,"limite"?: number,"meta"?: string,"meta_cfg"?: NonNullable<Json>,"nomina"?: NonNullable<Json>,"notif"?: NonNullable<Json>,"pct"?: NonNullable<Json>,"relaciones"?: (string)[],"setup"?: NonNullable<Json>,"smmlv"?: NonNullable<Json>,"trm"?: NonNullable<Json>,"trm_auto"?: boolean,"umbral"?: number,"updated_at"?: string,"usura"?: number,"usura_auto"?: boolean,"uvt"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "book_settings_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"books": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"household_id": string,"icon": string,"id": string,"is_default": boolean,"nombre": string,"sample": boolean,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id": string,"icon"?: string,"id"?: string,"is_default"?: boolean,"nombre": string,"sample"?: boolean,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"household_id"?: string,"icon"?: string,"id"?: string,"is_default"?: boolean,"nombre"?: string,"sample"?: boolean,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "books_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"broadcasts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"cuerpo": string,"enviados": number,"href": string | null,"id": string,"segmento": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"cuerpo"?: string,"enviados"?: number,"href"?: string | null,"id"?: string,"segmento"?: string,"titulo": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"cuerpo"?: string,"enviados"?: number,"href"?: string | null,"id"?: string,"segmento"?: string,"titulo"?: string
                  }
                  Relationships: [
                    
                  ]
                },"calendar_events": {
                  Row: {
                    "anual": boolean,"book_id": string,"cat": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fecha": string,"fuente": string | null,"id": string,"monto": number,"nota": string,"template_key": string | null,"tipo": string,"titulo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anual"?: boolean,"book_id": string,"cat"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha": string,"fuente"?: string | null,"id"?: string,"monto"?: number,"nota"?: string,"template_key"?: string | null,"tipo"?: string,"titulo": string,"updated_at"?: string
                  }
                  Update: {
                    "anual"?: boolean,"book_id"?: string,"cat"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string,"fuente"?: string | null,"id"?: string,"monto"?: number,"nota"?: string,"template_key"?: string | null,"tipo"?: string,"titulo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"card_payments": {
                  Row: {
                    "book_id": string,"card_id": string,"compras": (string)[],"created_at": string,"created_by": string | null,"deleted_at": string | null,"fecha": string,"id": string,"nota": string,"payment_method_id": string | null,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"card_id": string,"compras"?: (string)[],"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string,"id"?: string,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor": number
                  }
                  Update: {
                    "book_id"?: string,"card_id"?: string,"compras"?: (string)[],"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string,"id"?: string,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_payments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_payments_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "credit_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_payments_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"card_purchases": {
                  Row: {
                    "book_id": string,"card_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"cuotas": number,"deleted_at": string | null,"descripcion": string,"expense_id": string | null,"fecha": string,"id": string,"pagada": boolean,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"card_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuotas"?: number,"deleted_at"?: string | null,"descripcion"?: string,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"pagada"?: boolean,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"card_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuotas"?: number,"deleted_at"?: string | null,"descripcion"?: string,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"pagada"?: boolean,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "card_purchases_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_purchases_card_id_fkey"
      columns: ["card_id"]
isOneToOne: false
      referencedRelation: "credit_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_purchases_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "card_purchases_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"grupo": string,"icon": string,"id": string,"nombre": string,"sort": number,"tope": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"grupo"?: string,"icon"?: string,"id"?: string,"nombre": string,"sort"?: number,"tope"?: number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"grupo"?: string,"icon"?: string,"id"?: string,"nombre"?: string,"sort"?: number,"tope"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "adjuntos": NonNullable<Json>,"book_id": string,"content": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"feedback": number | null,"id": string,"meta": NonNullable<Json>,"role": string,"thread_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjuntos"?: NonNullable<Json>,"book_id": string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"feedback"?: number | null,"id"?: string,"meta"?: NonNullable<Json>,"role": string,"thread_id": string,"updated_at"?: string
                  }
                  Update: {
                    "adjuntos"?: NonNullable<Json>,"book_id"?: string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"feedback"?: number | null,"id"?: string,"meta"?: NonNullable<Json>,"role"?: string,"thread_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chat_messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "chat_threads"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_threads": {
                  Row: {
                    "archivado": boolean,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fijado": boolean,"id": string,"titulo": string,"titulo_auto": boolean,"ultimo": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archivado"?: boolean,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fijado"?: boolean,"id"?: string,"titulo"?: string,"titulo_auto"?: boolean,"ultimo"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "archivado"?: boolean,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fijado"?: boolean,"id"?: string,"titulo"?: string,"titulo_auto"?: boolean,"ultimo"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_threads_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "accepted_at": string,"document": string,"id": string,"user_agent": string | null,"user_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"document": string,"id"?: string,"user_agent"?: string | null,"user_id": string,"version": string
                  }
                  Update: {
                    "accepted_at"?: string,"document"?: string,"id"?: string,"user_agent"?: string | null,"user_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contacts": {
                  Row: {
                    "avatar_path": string | null,"book_id": string,"ciudad": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"direccion": NonNullable<Json>,"doc": string,"doc_tipo": string,"email": string,"id": string,"nombre": string,"notas": string,"relacion": string,"telefono": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"book_id": string,"ciudad"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string,"id"?: string,"nombre": string,"notas"?: string,"relacion"?: string,"telefono"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"book_id"?: string,"ciudad"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string,"id"?: string,"nombre"?: string,"notas"?: string,"relacion"?: string,"telefono"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"coupons": {
                  Row: {
                    "activo": boolean,"codigo": string,"created_at": string,"descripcion": string,"desde": string | null,"hasta": string | null,"max_usos": number | null,"periodos": (string)[],"planes": (string)[],"tipo": string,"usos": number,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"codigo": string,"created_at"?: string,"descripcion"?: string,"desde"?: string | null,"hasta"?: string | null,"max_usos"?: number | null,"periodos"?: (string)[],"planes"?: (string)[],"tipo": string,"usos"?: number,"valor": number
                  }
                  Update: {
                    "activo"?: boolean,"codigo"?: string,"created_at"?: string,"descripcion"?: string,"desde"?: string | null,"hasta"?: string | null,"max_usos"?: number | null,"periodos"?: (string)[],"planes"?: (string)[],"tipo"?: string,"usos"?: number,"valor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"credit_cards": {
                  Row: {
                    "book_id": string,"corte": number,"created_at": string,"created_by": string | null,"cupo": number,"deleted_at": string | null,"entity_id": string | null,"id": string,"nombre": string,"pago": number,"tasa": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"corte"?: number,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"entity_id"?: string | null,"id"?: string,"nombre": string,"pago"?: number,"tasa"?: number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"corte"?: number,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"entity_id"?: string | null,"id"?: string,"nombre"?: string,"pago"?: number,"tasa"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_cards_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credit_cards_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    }
                  ]
                },"emergency_funds": {
                  Row: {
                    "activo": boolean,"asset_id": string | null,"book_id": string,"saldo": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"asset_id"?: string | null,"book_id": string,"saldo"?: number,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"asset_id"?: string | null,"book_id"?: string,"saldo"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "emergency_funds_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "emergency_funds_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"entities": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"logo_path": string | null,"nit": string,"nombre": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nit"?: string,"nombre": string,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nit"?: string,"nombre"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entities_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "aporte": Json | null,"book_id": string,"cat_src": string | null,"category_id": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deducible": string | null,"deleted_at": string | null,"descripcion": string,"external_id": string | null,"fecha": string,"fixed_expense_id": string | null,"fondo_valor": number,"hormiga": boolean,"hormiga_razon": string | null,"hormiga_src": string | null,"id": string,"member_id": string | null,"member_ids": (string)[] | null,"nota": string,"origen": string,"payment_method_id": string | null,"periodo": string | null,"provider_id": string | null,"sub_parcial": boolean | null,"sub_proximo": string | null,"subscription_id": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aporte"?: Json | null,"book_id": string,"cat_src"?: string | null,"category_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducible"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string | null,"fondo_valor"?: number,"hormiga"?: boolean,"hormiga_razon"?: string | null,"hormiga_src"?: string | null,"id"?: string,"member_id"?: string | null,"member_ids"?: (string)[] | null,"nota"?: string,"origen"?: string,"payment_method_id"?: string | null,"periodo"?: string | null,"provider_id"?: string | null,"sub_parcial"?: boolean | null,"sub_proximo"?: string | null,"subscription_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "aporte"?: Json | null,"book_id"?: string,"cat_src"?: string | null,"category_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducible"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string | null,"fondo_valor"?: number,"hormiga"?: boolean,"hormiga_razon"?: string | null,"hormiga_src"?: string | null,"id"?: string,"member_id"?: string | null,"member_ids"?: (string)[] | null,"nota"?: string,"origen"?: string,"payment_method_id"?: string | null,"periodo"?: string | null,"provider_id"?: string | null,"sub_parcial"?: boolean | null,"sub_proximo"?: string | null,"subscription_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_fixed_expense_id_fkey"
      columns: ["fixed_expense_id"]
isOneToOne: false
      referencedRelation: "fixed_expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"extra_incomes": {
                  Row: {
                    "book_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"descripcion": string,"external_id": string | null,"fecha": string,"id": string,"member_id": string | null,"payment_method_id": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"id"?: string,"member_id"?: string | null,"payment_method_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"id"?: string,"member_id"?: string | null,"payment_method_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "extra_incomes_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extra_incomes_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "income_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extra_incomes_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extra_incomes_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"family_activity": {
                  Row: {
                    "actor_id": string,"book_id": string,"created_at": string,"href": string | null,"id": string,"lineas": string[],"n": number,"sent_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"book_id": string,"created_at"?: string,"href"?: string | null,"id"?: string,"lineas"?: string[],"n"?: number,"sent_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string,"book_id"?: string,"created_at"?: string,"href"?: string | null,"id"?: string,"lineas"?: string[],"n"?: number,"sent_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "family_activity_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"family_members": {
                  Row: {
                    "avatar": string,"color": string,"created_at": string,"created_by": string | null,"cupo": number,"deleted_at": string | null,"dep_de": string | null,"dep_rel": string | null,"discapacidad": boolean,"doc": string,"es_titular": boolean,"estudia": boolean,"household_id": string,"id": string,"nacimiento": string | null,"nombre": string,"rol": string,"sin_ingresos": boolean,"sort": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar"?: string,"color"?: string,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"dep_de"?: string | null,"dep_rel"?: string | null,"discapacidad"?: boolean,"doc"?: string,"es_titular"?: boolean,"estudia"?: boolean,"household_id": string,"id"?: string,"nacimiento"?: string | null,"nombre": string,"rol"?: string,"sin_ingresos"?: boolean,"sort"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar"?: string,"color"?: string,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"dep_de"?: string | null,"dep_rel"?: string | null,"discapacidad"?: boolean,"doc"?: string,"es_titular"?: boolean,"estudia"?: boolean,"household_id"?: string,"id"?: string,"nacimiento"?: string | null,"nombre"?: string,"rol"?: string,"sin_ingresos"?: boolean,"sort"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "family_members_dep_de_fkey"
      columns: ["dep_de"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "captura": string | null,"contexto": NonNullable<Json>,"created_at": string,"estado": string,"household_id": string | null,"id": string,"mensaje": string,"pagina": string | null,"rating": number | null,"respondido_at": string | null,"respondido_por": string | null,"respuesta": string | null,"tipo": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "captura"?: string | null,"contexto"?: NonNullable<Json>,"created_at"?: string,"estado"?: string,"household_id"?: string | null,"id"?: string,"mensaje"?: string,"pagina"?: string | null,"rating"?: number | null,"respondido_at"?: string | null,"respondido_por"?: string | null,"respuesta"?: string | null,"tipo": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "captura"?: string | null,"contexto"?: NonNullable<Json>,"created_at"?: string,"estado"?: string,"household_id"?: string | null,"id"?: string,"mensaje"?: string,"pagina"?: string | null,"rating"?: number | null,"respondido_at"?: string | null,"respondido_por"?: string | null,"respuesta"?: string | null,"tipo"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"fixed_expense_payments": {
                  Row: {
                    "book_id": string,"cierra": boolean | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expense_id": string | null,"fecha": string,"fixed_expense_id": string,"id": string,"payment_method_id": string | null,"periodo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cierra"?: boolean | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"fixed_expense_id": string,"id"?: string,"payment_method_id"?: string | null,"periodo": string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"cierra"?: boolean | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string,"id"?: string,"payment_method_id"?: string | null,"periodo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_expense_payments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expense_payments_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expense_payments_fixed_expense_id_fkey"
      columns: ["fixed_expense_id"]
isOneToOne: false
      referencedRelation: "fixed_expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expense_payments_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"fixed_expenses": {
                  Row: {
                    "aviso": number | null,"book_id": string,"category_id": string | null,"contact_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"desde": string,"dia": number,"dia2": number | null,"fecha_unica": string | null,"frec": string,"hasta": string | null,"id": string,"inicio": string | null,"link_id": string | null,"link_type": string | null,"logo_path": string | null,"member_id": string | null,"member_ids": (string)[] | null,"mes": number | null,"nombre": string,"payment_method_id": string | null,"proveedor": string,"provider_id": string | null,"referencia": string,"reparto": Json | null,"updated_at": string,"valor": number,"variable": boolean,"vmax": number | null,"vmin": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aviso"?: number | null,"book_id": string,"category_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"desde"?: string,"dia"?: number,"dia2"?: number | null,"fecha_unica"?: string | null,"frec"?: string,"hasta"?: string | null,"id"?: string,"inicio"?: string | null,"link_id"?: string | null,"link_type"?: string | null,"logo_path"?: string | null,"member_id"?: string | null,"member_ids"?: (string)[] | null,"mes"?: number | null,"nombre": string,"payment_method_id"?: string | null,"proveedor"?: string,"provider_id"?: string | null,"referencia"?: string,"reparto"?: Json | null,"updated_at"?: string,"valor"?: number,"variable"?: boolean,"vmax"?: number | null,"vmin"?: number | null
                  }
                  Update: {
                    "aviso"?: number | null,"book_id"?: string,"category_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"desde"?: string,"dia"?: number,"dia2"?: number | null,"fecha_unica"?: string | null,"frec"?: string,"hasta"?: string | null,"id"?: string,"inicio"?: string | null,"link_id"?: string | null,"link_type"?: string | null,"logo_path"?: string | null,"member_id"?: string | null,"member_ids"?: (string)[] | null,"mes"?: number | null,"nombre"?: string,"payment_method_id"?: string | null,"proveedor"?: string,"provider_id"?: string | null,"referencia"?: string,"reparto"?: Json | null,"updated_at"?: string,"valor"?: number,"variable"?: boolean,"vmax"?: number | null,"vmin"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fixed_expenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expenses_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expenses_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expenses_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expenses_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fixed_expenses_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"fund_movements": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expense_id": string | null,"fecha": string,"id": string,"nota": string,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"nota"?: string,"tipo": string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"nota"?: string,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fund_movements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fund_movements_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"gami_badges": {
                  Row: {
                    "badge": string,"book_id": string,"unlocked_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "badge": string,"book_id": string,"unlocked_at"?: string
                  }
                  Update: {
                    "badge"?: string,"book_id"?: string,"unlocked_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gami_badges_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"gami_missions": {
                  Row: {
                    "book_id": string,"done_at": string,"mision": string,"semana": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"done_at"?: string,"mision": string,"semana": string
                  }
                  Update: {
                    "book_id"?: string,"done_at"?: string,"mision"?: string,"semana"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gami_missions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"gami_points_ledger": {
                  Row: {
                    "book_id": string,"created_at": string,"fuente": string,"id": string,"puntos": number,"ref": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"fuente": string,"id"?: string,"puntos": number,"ref"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"fuente"?: string,"id"?: string,"puntos"?: number,"ref"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gami_points_ledger_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"gami_state": {
                  Row: {
                    "book_id": string,"init_date": string | null,"max_level": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"init_date"?: string | null,"max_level"?: number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"init_date"?: string | null,"max_level"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gami_state_book_id_fkey"
      columns: ["book_id"]
isOneToOne: true
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"gami_visits": {
                  Row: {
                    "book_id": string,"dia": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"dia": string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"dia"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gami_visits_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_movements": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fecha": string,"goal_id": string,"id": string,"nota": string,"payment_method_id": string | null,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string,"goal_id": string,"id"?: string,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor": number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string,"goal_id"?: string,"id"?: string,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_movements_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_movements_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_movements_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "ahorrado": number,"asset_id": string | null,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fecha": string | null,"icon": string,"id": string,"nombre": string,"objetivo": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ahorrado"?: number,"asset_id"?: string | null,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string | null,"icon"?: string,"id"?: string,"nombre": string,"objetivo"?: number,"updated_at"?: string
                  }
                  Update: {
                    "ahorrado"?: number,"asset_id"?: string | null,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string | null,"icon"?: string,"id"?: string,"nombre"?: string,"objetivo"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"google_connections": {
                  Row: {
                    "email": string | null,"scopes": (string)[],"tokens_enc": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: string | null,"scopes"?: (string)[],"tokens_enc"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "email"?: string | null,"scopes"?: (string)[],"tokens_enc"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"google_event_map": {
                  Row: {
                    "book_id": string,"calendar_id": string,"event_id": string,"fecha": string,"hash": string,"key": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"calendar_id"?: string,"event_id": string,"fecha": string,"hash": string,"key": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string,"calendar_id"?: string,"event_id"?: string,"fecha"?: string,"hash"?: string,"key"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "google_event_map_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"household_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"access_role": string | null,"canceled_at": string | null,"canceled_by": string | null,"created_at": string,"dest_key": string | null,"email": string | null,"expires_at": string,"family_member_id": string | null,"household_id": string,"id": string,"invited_by": string | null,"last_result": NonNullable<Json>,"last_sent_at": string | null,"nombre": string | null,"parentesco": string | null,"phone": string | null,"role": string,"sends_day": string | null,"sends_today": number,"sent_count": number,"token_enc": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"access_role"?: string | null,"canceled_at"?: string | null,"canceled_by"?: string | null,"created_at"?: string,"dest_key"?: never,"email"?: string | null,"expires_at"?: string,"family_member_id"?: string | null,"household_id": string,"id"?: string,"invited_by"?: string | null,"last_result"?: NonNullable<Json>,"last_sent_at"?: string | null,"nombre"?: string | null,"parentesco"?: string | null,"phone"?: string | null,"role"?: string,"sends_day"?: string | null,"sends_today"?: number,"sent_count"?: number,"token_enc"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"access_role"?: string | null,"canceled_at"?: string | null,"canceled_by"?: string | null,"created_at"?: string,"dest_key"?: never,"email"?: string | null,"expires_at"?: string,"family_member_id"?: string | null,"household_id"?: string,"id"?: string,"invited_by"?: string | null,"last_result"?: NonNullable<Json>,"last_sent_at"?: string | null,"nombre"?: string | null,"parentesco"?: string | null,"phone"?: string | null,"role"?: string,"sends_day"?: string | null,"sends_today"?: number,"sent_count"?: number,"token_enc"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_invitations_family_member_id_fkey"
      columns: ["family_member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_invitations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "access_role": string | null,"created_at": string,"household_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_role"?: string | null,"created_at"?: string,"household_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "access_role"?: string | null,"created_at"?: string,"household_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_transfers": {
                  Row: {
                    "created_at": string,"expires_at": string,"from_role": string,"from_user": string,"household_id": string,"id": string,"plan_action": string,"resolved_at": string | null,"resolved_by": string | null,"status": string,"to_user": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"from_role"?: string,"from_user": string,"household_id": string,"id"?: string,"plan_action"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"to_user": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"from_role"?: string,"from_user"?: string,"household_id"?: string,"id"?: string,"plan_action"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: string,"to_user"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_transfers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"nombre": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"nombre"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"income_categories": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"icon": string,"id": string,"nombre": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"nombre": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"nombre"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_categories_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"incomes": {
                  Row: {
                    "activo": boolean,"book_id": string,"bruto": number | null,"category_id": string | null,"concepto": string,"created_at": string,"created_by": string | null,"currency": string,"deducciones": Json | null,"deleted_at": string | null,"dia": number,"frec": string,"id": string,"member_id": string | null,"payment_method_id": string | null,"reparto": Json | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"book_id": string,"bruto"?: number | null,"category_id"?: string | null,"concepto": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducciones"?: Json | null,"deleted_at"?: string | null,"dia"?: number,"frec"?: string,"id"?: string,"member_id"?: string | null,"payment_method_id"?: string | null,"reparto"?: Json | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "activo"?: boolean,"book_id"?: string,"bruto"?: number | null,"category_id"?: string | null,"concepto"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducciones"?: Json | null,"deleted_at"?: string | null,"dia"?: number,"frec"?: string,"id"?: string,"member_id"?: string | null,"payment_method_id"?: string | null,"reparto"?: Json | null,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "incomes_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "income_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incomes_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"integrations": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"enabled": boolean,"household_id": string,"id": string,"kind": string,"meta": NonNullable<Json>,"secrets_enc": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"household_id": string,"id"?: string,"kind": string,"meta"?: NonNullable<Json>,"secrets_enc"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"enabled"?: boolean,"household_id"?: string,"id"?: string,"kind"?: string,"meta"?: NonNullable<Json>,"secrets_enc"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integrations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"investments": {
                  Row: {
                    "actual": number | null,"book_id": string,"cantidad": number | null,"capital": number,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"dias": number | null,"entity_id": string | null,"id": string,"inicio": string,"nombre": string,"ret": number,"symbol": string | null,"tasa": number,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual"?: number | null,"book_id": string,"cantidad"?: number | null,"capital"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"dias"?: number | null,"entity_id"?: string | null,"id"?: string,"inicio"?: string,"nombre": string,"ret"?: number,"symbol"?: string | null,"tasa"?: number,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "actual"?: number | null,"book_id"?: string,"cantidad"?: number | null,"capital"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"dias"?: number | null,"entity_id"?: string | null,"id"?: string,"inicio"?: string,"nombre"?: string,"ret"?: number,"symbol"?: string | null,"tasa"?: number,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "investments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "investments_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    }
                  ]
                },"keyword_rules": {
                  Row: {
                    "book_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"keyword": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"keyword": string,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"keyword"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "keyword_rules_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "keyword_rules_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"liabilities": {
                  Row: {
                    "book_id": string,"cod": string,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"id": string,"nombre": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cod"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"nombre": string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"cod"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"nombre"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "liabilities_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"loan_payments": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expense_id": string | null,"fecha": string,"id": string,"loan_id": string,"modo": string | null,"nota": string,"payment_method_id": string | null,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"loan_id": string,"modo"?: string | null,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"loan_id"?: string,"modo"?: string | null,"nota"?: string,"payment_method_id"?: string | null,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "loan_payments_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loan_payments_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loan_payments_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "loans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loan_payments_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"loans": {
                  Row: {
                    "acreedor": string | null,"book_id": string,"cerrado_at": string | null,"concepto": string,"contact_id": string | null,"created_at": string,"created_by": string | null,"cuota_fija": number | null,"currency": string,"deleted_at": string | null,"entity_id": string | null,"extra": number,"fiado": boolean,"frec": string,"id": string,"inicio": string,"kind": string,"monto": number,"nota": string,"plazo": number,"prenda": Json | null,"primera": string | null,"provider_id": string | null,"sistema": string,"tasa": number,"tasa_ea": number | null,"tipo": string | null,"updated_at": string,"vence": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acreedor"?: string | null,"book_id": string,"cerrado_at"?: string | null,"concepto"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuota_fija"?: number | null,"currency"?: string,"deleted_at"?: string | null,"entity_id"?: string | null,"extra"?: number,"fiado"?: boolean,"frec"?: string,"id"?: string,"inicio"?: string,"kind": string,"monto"?: number,"nota"?: string,"plazo"?: number,"prenda"?: Json | null,"primera"?: string | null,"provider_id"?: string | null,"sistema"?: string,"tasa"?: number,"tasa_ea"?: number | null,"tipo"?: string | null,"updated_at"?: string,"vence"?: string | null
                  }
                  Update: {
                    "acreedor"?: string | null,"book_id"?: string,"cerrado_at"?: string | null,"concepto"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuota_fija"?: number | null,"currency"?: string,"deleted_at"?: string | null,"entity_id"?: string | null,"extra"?: number,"fiado"?: boolean,"frec"?: string,"id"?: string,"inicio"?: string,"kind"?: string,"monto"?: number,"nota"?: string,"plazo"?: number,"prenda"?: Json | null,"primera"?: string | null,"provider_id"?: string | null,"sistema"?: string,"tasa"?: number,"tasa_ea"?: number | null,"tipo"?: string | null,"updated_at"?: string,"vence"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "loans_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_entity_id_fkey"
      columns: ["entity_id"]
isOneToOne: false
      referencedRelation: "entities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "loans_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_summaries": {
                  Row: {
                    "book_id": string,"contenido": NonNullable<Json>,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"mes": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"contenido"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"mes": string,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"contenido"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"mes"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_summaries_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"net_worth_snapshots": {
                  Row: {
                    "activos": number,"book_id": string,"created_at": string,"deleted_at": string | null,"deudas": number,"id": string,"mes": string,"patrimonio": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activos"?: number,"book_id": string,"created_at"?: string,"deleted_at"?: string | null,"deudas"?: number,"id"?: string,"mes": string,"patrimonio"?: number,"updated_at"?: string
                  }
                  Update: {
                    "activos"?: number,"book_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"deudas"?: number,"id"?: string,"mes"?: string,"patrimonio"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "net_worth_snapshots_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_log": {
                  Row: {
                    "book_id": string | null,"channel": string,"created_at": string,"dedupe": string | null,"destino": string | null,"error": string | null,"household_id": string | null,"id": number,"kind": string,"provider": string | null,"ref": string | null,"source": string | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id"?: string | null,"channel": string,"created_at"?: string,"dedupe"?: string | null,"destino"?: string | null,"error"?: string | null,"household_id"?: string | null,"id"?: never,"kind"?: string,"provider"?: string | null,"ref"?: string | null,"source"?: string | null,"status": string,"user_id"?: string | null
                  }
                  Update: {
                    "book_id"?: string | null,"channel"?: string,"created_at"?: string,"dedupe"?: string | null,"destino"?: string | null,"error"?: string | null,"household_id"?: string | null,"id"?: never,"kind"?: string,"provider"?: string | null,"ref"?: string | null,"source"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_log_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_outbox": {
                  Row: {
                    "attempts": number,"book_id": string | null,"channel": string,"created_at": string,"error": string | null,"id": string,"kind": string,"payload": NonNullable<Json>,"scheduled_for": string,"sent_at": string | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"book_id"?: string | null,"channel": string,"created_at"?: string,"error"?: string | null,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"book_id"?: string | null,"channel"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"scheduled_for"?: string,"sent_at"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_outbox_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_rules": {
                  Row: {
                    "book_id": string,"canales": NonNullable<Json>,"email_to": string | null,"frecuencia": string,"hora": number,"last_sent": NonNullable<Json>,"matriz": NonNullable<Json>,"notif": Json | null,"ocultar_montos": boolean,"silencio": NonNullable<Json>,"timezone": string,"updated_at": string,"user_id": string,"whatsapp_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"canales"?: NonNullable<Json>,"email_to"?: string | null,"frecuencia"?: string,"hora"?: number,"last_sent"?: NonNullable<Json>,"matriz"?: NonNullable<Json>,"notif"?: Json | null,"ocultar_montos"?: boolean,"silencio"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id": string,"whatsapp_to"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"canales"?: NonNullable<Json>,"email_to"?: string | null,"frecuencia"?: string,"hora"?: number,"last_sent"?: NonNullable<Json>,"matriz"?: NonNullable<Json>,"notif"?: Json | null,"ocultar_montos"?: boolean,"silencio"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"whatsapp_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_rules_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "book_id": string | null,"created_at": string,"cuerpo": string,"dedupe": string | null,"href": string | null,"id": string,"kind": string,"read_at": string | null,"titulo": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id"?: string | null,"created_at"?: string,"cuerpo"?: string,"dedupe"?: string | null,"href"?: string | null,"id"?: string,"kind": string,"read_at"?: string | null,"titulo": string,"user_id": string
                  }
                  Update: {
                    "book_id"?: string | null,"created_at"?: string,"cuerpo"?: string,"dedupe"?: string | null,"href"?: string | null,"id"?: string,"kind"?: string,"read_at"?: string | null,"titulo"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_methods": {
                  Row: {
                    "asset_id": string | null,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"icon": string,"id": string,"nombre": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"nombre": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "asset_id"?: string | null,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string,"id"?: string,"nombre"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_methods_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_methods_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_payments": {
                  Row: {
                    "created_at": string,"cupon": string | null,"estado": string,"factura_ref": string | null,"household_id": string | null,"id": string,"metodo": string | null,"monto": number,"nota": string | null,"pagador": string | null,"paid_at": string | null,"periodo": string | null,"plan": string | null,"proveedor": string,"raw": NonNullable<Json>,"referencia": string,"subscription_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cupon"?: string | null,"estado"?: string,"factura_ref"?: string | null,"household_id"?: string | null,"id"?: string,"metodo"?: string | null,"monto": number,"nota"?: string | null,"pagador"?: string | null,"paid_at"?: string | null,"periodo"?: string | null,"plan"?: string | null,"proveedor": string,"raw"?: NonNullable<Json>,"referencia": string,"subscription_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"cupon"?: string | null,"estado"?: string,"factura_ref"?: string | null,"household_id"?: string | null,"id"?: string,"metodo"?: string | null,"monto"?: number,"nota"?: string | null,"pagador"?: string | null,"paid_at"?: string | null,"periodo"?: string | null,"plan"?: string | null,"proveedor"?: string,"raw"?: NonNullable<Json>,"referencia"?: string,"subscription_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_payments_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_payments_plan_fkey"
      columns: ["plan"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_payments_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "plan_subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_subscriptions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"estado": string,"household_id": string,"id": string,"nota": string | null,"periodo": string,"plan": string,"proveedor": string,"proveedor_ref": string | null,"updated_at": string,"vence_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"estado"?: string,"household_id": string,"id"?: string,"nota"?: string | null,"periodo"?: string,"plan"?: string,"proveedor": string,"proveedor_ref"?: string | null,"updated_at"?: string,"vence_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"estado"?: string,"household_id"?: string,"id"?: string,"nota"?: string | null,"periodo"?: string,"plan"?: string,"proveedor"?: string,"proveedor_ref"?: string | null,"updated_at"?: string,"vence_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_subscriptions_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_subscriptions_plan_fkey"
      columns: ["plan"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "activo": boolean,"anuncios": boolean,"descripcion": string,"destacado": boolean,"funciones": (string)[],"ia_creditos": number | null,"id": string,"limites": NonNullable<Json>,"nombre": string,"orden": number,"precio_anio": number,"precio_mes": number,"publico": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"anuncios"?: boolean,"descripcion"?: string,"destacado"?: boolean,"funciones"?: (string)[],"ia_creditos"?: number | null,"id": string,"limites"?: NonNullable<Json>,"nombre": string,"orden"?: number,"precio_anio"?: number,"precio_mes"?: number,"publico"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"anuncios"?: boolean,"descripcion"?: string,"destacado"?: boolean,"funciones"?: (string)[],"ia_creditos"?: number | null,"id"?: string,"limites"?: NonNullable<Json>,"nombre"?: string,"orden"?: number,"precio_anio"?: number,"precio_mes"?: number,"publico"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_integrations": {
                  Row: {
                    "config": NonNullable<Json>,"kind": string,"meta": NonNullable<Json>,"modo": string,"planes": (string)[],"secrets_enc": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"kind": string,"meta"?: NonNullable<Json>,"modo"?: string,"planes"?: (string)[],"secrets_enc"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"kind"?: string,"meta"?: NonNullable<Json>,"modo"?: string,"planes"?: (string)[],"secrets_enc"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "anuncios_accion_cada": number,"anuncios_adsense_pct": number,"anuncios_modal_horas": number,"anuncios_ticker": boolean,"api_rollout": NonNullable<Json>,"aviso_global": string,"aviso_tono": string,"cron_horario": boolean,"cron_horario_visto": string | null,"ia_aviso_pct": number,"ia_cache_horas": number,"ia_credito_usd": number,"ia_cupos_activo": boolean,"ia_precios": NonNullable<Json>,"id": boolean,"limites_db": boolean,"premium_db": boolean,"referidos_activo": boolean,"referidos_dias": number,"referidos_plan": string,"registro_abierto": boolean,"sync_enlaces": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anuncios_accion_cada"?: number,"anuncios_adsense_pct"?: number,"anuncios_modal_horas"?: number,"anuncios_ticker"?: boolean,"api_rollout"?: NonNullable<Json>,"aviso_global"?: string,"aviso_tono"?: string,"cron_horario"?: boolean,"cron_horario_visto"?: string | null,"ia_aviso_pct"?: number,"ia_cache_horas"?: number,"ia_credito_usd"?: number,"ia_cupos_activo"?: boolean,"ia_precios"?: NonNullable<Json>,"id"?: boolean,"limites_db"?: boolean,"premium_db"?: boolean,"referidos_activo"?: boolean,"referidos_dias"?: number,"referidos_plan"?: string,"registro_abierto"?: boolean,"sync_enlaces"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "anuncios_accion_cada"?: number,"anuncios_adsense_pct"?: number,"anuncios_modal_horas"?: number,"anuncios_ticker"?: boolean,"api_rollout"?: NonNullable<Json>,"aviso_global"?: string,"aviso_tono"?: string,"cron_horario"?: boolean,"cron_horario_visto"?: string | null,"ia_aviso_pct"?: number,"ia_cache_horas"?: number,"ia_credito_usd"?: number,"ia_cupos_activo"?: boolean,"ia_precios"?: NonNullable<Json>,"id"?: boolean,"limites_db"?: boolean,"premium_db"?: boolean,"referidos_activo"?: boolean,"referidos_dias"?: number,"referidos_plan"?: string,"registro_abierto"?: boolean,"sync_enlaces"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "apodo": string,"avatar_url": string | null,"ciudad": string,"cobro": NonNullable<Json>,"created_at": string,"deletion_requested_at": string | null,"digitos": string,"direccion": NonNullable<Json>,"doc": string,"doc_tipo": string,"email": string | null,"id": string,"last_book_id": string | null,"nacimiento": string | null,"nombre": string,"ocupacion": string,"portada": string,"riesgo": string,"telefono": string,"trabajo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apodo"?: string,"avatar_url"?: string | null,"ciudad"?: string,"cobro"?: NonNullable<Json>,"created_at"?: string,"deletion_requested_at"?: string | null,"digitos"?: string,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string | null,"id": string,"last_book_id"?: string | null,"nacimiento"?: string | null,"nombre"?: string,"ocupacion"?: string,"portada"?: string,"riesgo"?: string,"telefono"?: string,"trabajo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "apodo"?: string,"avatar_url"?: string | null,"ciudad"?: string,"cobro"?: NonNullable<Json>,"created_at"?: string,"deletion_requested_at"?: string | null,"digitos"?: string,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string | null,"id"?: string,"last_book_id"?: string | null,"nacimiento"?: string | null,"nombre"?: string,"ocupacion"?: string,"portada"?: string,"riesgo"?: string,"telefono"?: string,"trabajo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"providers": {
                  Row: {
                    "activo": boolean,"book_id": string,"brand": string | null,"category_id": string | null,"correo": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"icon": string | null,"id": string,"nit": string,"nombre": string,"notas": string,"payment_method_id": string | null,"referencia": string,"sitio_web": string,"telefono": string,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"book_id": string,"brand"?: string | null,"category_id"?: string | null,"correo"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string | null,"id"?: string,"nit"?: string,"nombre": string,"notas"?: string,"payment_method_id"?: string | null,"referencia"?: string,"sitio_web"?: string,"telefono"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"book_id"?: string,"brand"?: string | null,"category_id"?: string | null,"correo"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"icon"?: string | null,"id"?: string,"nit"?: string,"nombre"?: string,"notas"?: string,"payment_method_id"?: string | null,"referencia"?: string,"sitio_web"?: string,"telefono"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "providers_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "providers_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "providers_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ref_fiscal_templates": {
                  Row: {
                    "data": NonNullable<Json>,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"key": string
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ref_holidays": {
                  Row: {
                    "fecha": string,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha": string,"nombre": string
                  }
                  Update: {
                    "fecha"?: string,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ref_municipalities": {
                  Row: {
                    "aliases": (string)[],"barrios": (string)[],"code": string,"departamento": string,"dept_code": string,"nombre": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"barrios"?: (string)[],"code": string,"departamento": string,"dept_code": string,"nombre": string
                  }
                  Update: {
                    "aliases"?: (string)[],"barrios"?: (string)[],"code"?: string,"departamento"?: string,"dept_code"?: string,"nombre"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ref_rates": {
                  Row: {
                    "base": string,"fecha": string,"quote": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": string,"fecha": string,"quote": string,"valor": number
                  }
                  Update: {
                    "base"?: string,"fecha"?: string,"quote"?: string,"valor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ref_renta_calendar": {
                  Row: {
                    "digitos": string,"fecha": string,"regimen": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "digitos": string,"fecha": string,"regimen"?: string,"year": number
                  }
                  Update: {
                    "digitos"?: string,"fecha"?: string,"regimen"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ref_renta_regimenes": {
                  Row: {
                    "descripcion": string,"key": string,"nombre": string,"norma": string,"seccionales": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "descripcion": string,"key": string,"nombre": string,"norma": string,"seccionales"?: (string)[]
                  }
                  Update: {
                    "descripcion"?: string,"key"?: string,"nombre"?: string,"norma"?: string,"seccionales"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"ref_smmlv": {
                  Row: {
                    "fuente": string | null,"valor": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fuente"?: string | null,"valor": number,"year": number
                  }
                  Update: {
                    "fuente"?: string | null,"valor"?: number,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ref_trm": {
                  Row: {
                    "fecha": string,"fuente": string | null,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha": string,"fuente"?: string | null,"valor": number
                  }
                  Update: {
                    "fecha"?: string,"fuente"?: string | null,"valor"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ref_usury_rate": {
                  Row: {
                    "desde": string,"hasta": string,"modalidad": string,"tasa_ea": number
                  }
                  ComputedFields: never
                  Insert: {
                    "desde": string,"hasta": string,"modalidad"?: string,"tasa_ea": number
                  }
                  Update: {
                    "desde"?: string,"hasta"?: string,"modalidad"?: string,"tasa_ea"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ref_uvt": {
                  Row: {
                    "fuente": string | null,"valor": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fuente"?: string | null,"valor": number,"year": number
                  }
                  Update: {
                    "fuente"?: string | null,"valor"?: number,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"referral_codes": {
                  Row: {
                    "codigo": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "codigo"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"referrals": {
                  Row: {
                    "codigo": string,"created_at": string,"estado": string,"id": string,"referred": string,"referrer": string,"rewarded_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "codigo": string,"created_at"?: string,"estado"?: string,"id"?: string,"referred": string,"referrer": string,"rewarded_at"?: string | null
                  }
                  Update: {
                    "codigo"?: string,"created_at"?: string,"estado"?: string,"id"?: string,"referred"?: string,"referrer"?: string,"rewarded_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"savings_challenges": {
                  Row: {
                    "base": number,"book_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"dias": number | null,"id": string,"inicio": string,"k": string,"marcas": NonNullable<Json>,"n": number | null,"tipo": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base"?: number,"book_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"dias"?: number | null,"id"?: string,"inicio"?: string,"k": string,"marcas"?: NonNullable<Json>,"n"?: number | null,"tipo": string,"updated_at"?: string
                  }
                  Update: {
                    "base"?: number,"book_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"dias"?: number | null,"id"?: string,"inicio"?: string,"k"?: string,"marcas"?: NonNullable<Json>,"n"?: number | null,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_challenges_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "savings_challenges_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_group_expenses": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"descripcion": string,"entre": (string)[],"expense_id": string | null,"fecha": string,"group_id": string,"id": string,"paga": string,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"entre"?: (string)[],"expense_id"?: string | null,"fecha"?: string,"group_id": string,"id"?: string,"paga": string,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"entre"?: (string)[],"expense_id"?: string | null,"fecha"?: string,"group_id"?: string,"id"?: string,"paga"?: string,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_group_expenses_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shared_group_expenses_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shared_group_expenses_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "shared_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_groups": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"nombre": string,"personas": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"nombre": string,"personas"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"nombre"?: string,"personas"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_groups_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "activa": boolean,"book_id": string,"category_id": string | null,"ciclo": string,"comparte": number,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"id": string,"logo_path": string | null,"nombre": string,"payment_method_id": string | null,"provider_id": string | null,"proximo": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"book_id": string,"category_id"?: string | null,"ciclo"?: string,"comparte"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nombre": string,"payment_method_id"?: string | null,"provider_id"?: string | null,"proximo"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "activa"?: boolean,"book_id"?: string,"category_id"?: string | null,"ciclo"?: string,"comparte"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nombre"?: string,"payment_method_id"?: string | null,"provider_id"?: string | null,"proximo"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_assets": {
                  Row: {
                    "asset_id": string | null,"avaluo": number,"book_id": string,"costo": number,"created_at": string,"created_by": string | null,"deleted_at": string | null,"entidad": string,"fecha_adq": string | null,"id": string,"ident": string,"imp_veh": number | null,"member_id": string | null,"nombre": string,"pct": number,"predial": number | null,"soat": number | null,"tipo": string,"updated_at": string,"valor31": number
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"avaluo"?: number,"book_id": string,"costo"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"entidad"?: string,"fecha_adq"?: string | null,"id"?: string,"ident"?: string,"imp_veh"?: number | null,"member_id"?: string | null,"nombre": string,"pct"?: number,"predial"?: number | null,"soat"?: number | null,"tipo"?: string,"updated_at"?: string,"valor31"?: number
                  }
                  Update: {
                    "asset_id"?: string | null,"avaluo"?: number,"book_id"?: string,"costo"?: number,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"entidad"?: string,"fecha_adq"?: string | null,"id"?: string,"ident"?: string,"imp_veh"?: number | null,"member_id"?: string | null,"nombre"?: string,"pct"?: number,"predial"?: number | null,"soat"?: number | null,"tipo"?: string,"updated_at"?: string,"valor31"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_assets_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tax_assets_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tax_assets_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    }
                  ]
                },"tax_years": {
                  Row: {
                    "book_id": string,"consig": number,"consumos": number,"created_at": string,"created_by": string | null,"ded": NonNullable<Json>,"deleted_at": string | null,"docs": NonNullable<Json>,"id": string,"ing": NonNullable<Json>,"member_id": string,"updated_at": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"consig"?: number,"consumos"?: number,"created_at"?: string,"created_by"?: string | null,"ded"?: NonNullable<Json>,"deleted_at"?: string | null,"docs"?: NonNullable<Json>,"id"?: string,"ing"?: NonNullable<Json>,"member_id": string,"updated_at"?: string,"year": number
                  }
                  Update: {
                    "book_id"?: string,"consig"?: number,"consumos"?: number,"created_at"?: string,"created_by"?: string | null,"ded"?: NonNullable<Json>,"deleted_at"?: string | null,"docs"?: NonNullable<Json>,"id"?: string,"ing"?: NonNullable<Json>,"member_id"?: string,"updated_at"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_years_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tax_years_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["id"]
    }
                  ]
                },"telegram_links": {
                  Row: {
                    "chat_id": string | null,"created_at": string,"link_code": string | null,"linked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id"?: string | null,"created_at"?: string,"link_code"?: string | null,"linked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "chat_id"?: string | null,"created_at"?: string,"link_code"?: string | null,"linked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_preferences": {
                  Row: {
                    "calendar_prefs": NonNullable<Json>,"chat_pos": Json | null,"dense": boolean,"extra": NonNullable<Json>,"font_scale": string,"home_view": string,"lock_minutes": number,"nav_open": NonNullable<Json>,"privacy_blur_on_leave": boolean,"privacy_mode": boolean,"reduce_motion": boolean,"seen_release": string | null,"sidebar_collapsed": boolean,"theme": string,"tour_done": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calendar_prefs"?: NonNullable<Json>,"chat_pos"?: Json | null,"dense"?: boolean,"extra"?: NonNullable<Json>,"font_scale"?: string,"home_view"?: string,"lock_minutes"?: number,"nav_open"?: NonNullable<Json>,"privacy_blur_on_leave"?: boolean,"privacy_mode"?: boolean,"reduce_motion"?: boolean,"seen_release"?: string | null,"sidebar_collapsed"?: boolean,"theme"?: string,"tour_done"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "calendar_prefs"?: NonNullable<Json>,"chat_pos"?: Json | null,"dense"?: boolean,"extra"?: NonNullable<Json>,"font_scale"?: string,"home_view"?: string,"lock_minutes"?: number,"nav_open"?: NonNullable<Json>,"privacy_blur_on_leave"?: boolean,"privacy_mode"?: boolean,"reduce_motion"?: boolean,"seen_release"?: string | null,"sidebar_collapsed"?: boolean,"theme"?: string,"tour_done"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wishlist": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"esperar_hasta": string,"estado": string,"id": string,"nombre": string,"nota": string,"precio": number,"prioridad": number,"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"esperar_hasta"?: string,"estado"?: string,"id"?: string,"nombre": string,"nota"?: string,"precio"?: number,"prioridad"?: number,"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"esperar_hasta"?: string,"estado"?: string,"id"?: string,"nombre"?: string,"nota"?: string,"precio"?: number,"prioridad"?: number,"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlist_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "google_connections_public": {
                  Row: {
                    "email": string | null,"scopes": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "email"?: string | null,"scopes"?: (string)[] | null,"updated_at"?: string | null,"user_id"?: string | null
                         }
                        Update: {
                           "email"?: string | null,"scopes"?: (string)[] | null,"updated_at"?: string | null,"user_id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"integrations_public": {
                  Row: {
                    "config": NonNullable<Json>,"enabled": boolean,"household_id": string,"id": string,"kind": string,"meta": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "config"?: Json | null,"enabled"?: boolean | null,"household_id"?: string | null,"id"?: string | null,"kind"?: string | null,"meta"?: Json | null,"updated_at"?: string | null
                         }
                        Update: {
                           "config"?: Json | null,"enabled"?: boolean | null,"household_id"?: string | null,"id"?: string | null,"kind"?: string | null,"meta"?: Json | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "integrations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_integrations_public": {
                  Row: {
                    "config": NonNullable<Json>,"kind": string,"meta": Json | null,"modo": string,"planes": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                           "config"?: Json | null,"kind"?: string | null,"meta"?: never,"modo"?: string | null,"planes"?: (string)[] | null
                         }
                        Update: {
                           "config"?: Json | null,"kind"?: string | null,"meta"?: never,"modo"?: string | null,"planes"?: (string)[] | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"ad_reach":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: {
              "ad_id": string,"alcance": number,"clics": number,"vistas": number
            }[]
                           },
"ad_track":
{ Args: { "p_ad": string,"p_kind": string,"p_slot": string }; Returns: undefined
                           },
"add_card_purchase":
{ Args: { "p_card": string,"p_category"?: string,"p_como_gasto"?: boolean,"p_cuotas"?: number,"p_descripcion": string,"p_external_id"?: string,"p_fecha": string,"p_medio"?: string,"p_member"?: string,"p_provider"?: string,"p_valor": number }; Returns: Json
                           },
"admin_migrations":
{ Args: Record<PropertyKey, never>; Returns: {
              "applied_at": string,"name": string
            }[]
                           },
"ai_creditos_desde":
{ Args: { "desde": string,"h": string }; Returns: number
                           },
"ai_usage_rollup":
{ Args: { "p_desde": string,"p_household"?: string }; Returns: {
              "cached_tokens": number,"costo_cop": number,"costo_usd": number,"creditos": number,"de_plataforma": boolean,"dia": string,"duracion_ms": number,"feature": string,"fuente": string,"household_id": string,"input_tokens": number,"llamadas": number,"model": string,"ok": boolean,"output_tokens": number,"plan": string,"provider": string,"tokens_evitados": number
            }[]
                           },
"api_idempotency_cleanup":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"apply_household_transfer":
{ Args: { "p_from": string,"p_from_role": string,"p_household": string,"p_to": string }; Returns: undefined
                           },
"apply_plan_payment":
{ Args: { "p_cupon"?: string,"p_estado": string,"p_household": string,"p_metodo"?: string,"p_monto": number,"p_nota"?: string,"p_pagador"?: string,"p_periodo": string,"p_plan"?: string,"p_proveedor": string,"p_raw"?: Json,"p_referencia": string,"p_subscription_ref"?: string }; Returns: Json
                           },
"asset_cuadrar":
{ Args: { "p_asset": string,"p_saldo": number }; Returns: {
              "book_id": string,
"cod": string,
"created_at": string,
"created_by": string | null,
"currency": string,
"deleted_at": string | null,
"id": string,
"nombre": string,
"saldo_at": string | null,
"saldo_base": number | null,
"saldo_fecha": string | null,
"updated_at": string,
"valor": number
            }
                          SetofOptions: {
        from: "*"
        to: "assets"
        isOneToOne: true
        isSetofReturn: false
      } },
"automation_as":
{ Args: { "p_user": string }; Returns: undefined
                           },
"automation_create_income":
{ Args: { "p_book": string,"p_category"?: string,"p_descripcion": string,"p_fecha": string,"p_user": string,"p_valor": number }; Returns: string
                           },
"automation_pay_fixed":
{ Args: { "p_desc_suffix"?: string,"p_fecha": string,"p_fixed": string,"p_periodo": string,"p_user": string,"p_valor": number }; Returns: Json
                           },
"book_household":
{ Args: { "bk": string }; Returns: string
                           },
"book_plan_ok":
{ Args: { "bk": string,"f": string }; Returns: boolean
                           },
"cancel_household_transfer":
{ Args: { "p_transfer": string }; Returns: undefined
                           },
"cancel_my_email_change":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"count_orphan_households":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"create_book":
{ Args: { "p_household": string,"p_icon"?: string,"p_nombre": string,"p_tipo"?: string }; Returns: string
                           },
"create_household":
{ Args: { "p_libro"?: string,"p_nombre": string }; Returns: string
                           },
"delete_orphan_households":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"ensure_email_identity":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"fund_save":
{ Args: { "p_book": string,"p_fecha": string,"p_nota"?: string,"p_valor": number }; Returns: number
                           },
"fund_use":
{ Args: { "p_book": string,"p_desc": string,"p_fecha": string,"p_medio"?: string,"p_valor": number }; Returns: Json
                           },
"goal_contribute":
{ Args: { "p_fecha"?: string,"p_goal": string,"p_medio"?: string,"p_nota"?: string,"p_valor": number }; Returns: Json
                           },
"household_can":
{ Args: { "f": string,"h": string }; Returns: boolean
                           },
"household_plan":
{ Args: { "h": string }; Returns: string
                           },
"household_subscription":
{ Args: { "h": string }; Returns: {
              "estado": string,"id": string,"periodo": string,"plan": string,"proveedor": string,"vence_at": string
            }[]
                           },
"invitation_dest_key":
{ Args: { "p_email": string,"p_phone": string }; Returns: string
                           },
"invitation_info":
{ Args: { "p_token": string }; Returns: Json
                           },
"is_book_member":
{ Args: { "bk": string,"min_role"?: string }; Returns: boolean
                           },
"is_household_member":
{ Args: { "hh": string,"min_role"?: string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"join_from_invitation":
{ Args: { "p_inv": string,"p_uid": string }; Returns: string
                           },
"legacy_role":
{ Args: { "r": string }; Returns: string
                           },
"link_expense_fixed":
{ Args: { "p_cierra"?: boolean,"p_expense": string,"p_fixed": string,"p_periodo": string }; Returns: Json
                           },
"link_family_member":
{ Args: { "p_family": string,"p_household": string,"p_user": string }; Returns: undefined
                           },
"log_account_event":
{ Args: { "p_detail"?: Json,"p_kind": string,"p_user": string }; Returns: undefined
                           },
"member_access":
{ Args: { "p_household": string,"p_user": string }; Returns: string
                           },
"mirai_app_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mirai_live_notify_install":
{ Args: { "enable"?: boolean }; Returns: number
                           },
"mirai_notify_cron_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mirai_schedule_notify":
{ Args: { "cron_secret": string,"site_url": string }; Returns: string
                           },
"my_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_sessions":
{ Args: Record<PropertyKey, never>; Returns: {
              "aal": string,"actual": boolean,"created_at": string,"id": string,"ip": string,"last_active": string,"user_agent": string
            }[]
                           },
"notify_claim":
{ Args: { "p_book": string,"p_channel": string,"p_dedupe": string,"p_household": string,"p_kind": string,"p_user": string }; Returns: number
                           },
"pay_credit_card":
{ Args: { "p_card": string,"p_fecha"?: string,"p_medio"?: string,"p_nota"?: string,"p_tipo"?: string,"p_valor": number }; Returns: Json
                           },
"pay_fixed_expense":
{ Args: { "p_cierra"?: boolean,"p_desc_suffix"?: string,"p_fecha": string,"p_fixed": string,"p_medio"?: string,"p_periodo": string,"p_valor": number }; Returns: Json
                           },
"pay_subscription":
{ Args: { "p_fecha"?: string,"p_medio"?: string,"p_parcial"?: boolean,"p_sub": string,"p_valor"?: number }; Returns: Json
                           },
"person_label":
{ Args: { "p_user": string }; Returns: string
                           },
"plan_automation_limit":
{ Args: { "h": string }; Returns: number
                           },
"provider_norm":
{ Args: { "s": string }; Returns: string
                           },
"provider_tipo":
{ Args: { "s": string }; Returns: string
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_s": number }; Returns: {
              "ok": boolean,"remaining": number,"reset_ms": number
            }[]
                           },
"registro_abierto":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"remove_household_member":
{ Args: { "p_household": string,"p_user": string }; Returns: undefined
                           },
"remove_my_password":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"request_household_transfer":
{ Args: { "p_confirm": string,"p_from_role": string,"p_household": string,"p_plan_action": string,"p_user": string }; Returns: string
                           },
"respond_household_transfer":
{ Args: { "p_accept": boolean,"p_transfer": string }; Returns: Json
                           },
"revoke_my_session":
{ Args: { "p_session": string }; Returns: boolean
                           },
"role_rank":
{ Args: { "r": string }; Returns: number
                           },
"seed_book_defaults":
{ Args: { "bk": string }; Returns: undefined
                           },
"set_member_access":
{ Args: { "p_access": string,"p_household": string,"p_user": string }; Returns: undefined
                           },
"sync_enlaces_on":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"transfer_household":
{ Args: { "p_household": string,"p_user": string }; Returns: undefined
                           },
"try_uuid":
{ Args: { "t": string }; Returns: string
                           },
"unlink_expense_fixed":
{ Args: { "p_expense": string }; Returns: undefined
                           },
"unpay_fixed_expense":
{ Args: { "p_payment": string }; Returns: undefined
                           },
"use_emergency_fund":
{ Args: { "p_expense": string,"p_valor": number }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
