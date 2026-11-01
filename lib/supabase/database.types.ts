
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
                },"assets": {
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
                    "alerta_pres": number,"anticipo": number,"apps": NonNullable<Json>,"book_id": string,"corte_q": number,"defaults": NonNullable<Json>,"emerg_meta": number,"estricto": string,"ia": NonNullable<Json>,"limite": number,"meta": string,"notif": NonNullable<Json>,"pct": NonNullable<Json>,"relaciones": (string)[],"setup": NonNullable<Json>,"smmlv": NonNullable<Json>,"trm": NonNullable<Json>,"trm_auto": boolean,"umbral": number,"updated_at": string,"usura": number,"usura_auto": boolean,"uvt": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "alerta_pres"?: number,"anticipo"?: number,"apps"?: NonNullable<Json>,"book_id": string,"corte_q"?: number,"defaults"?: NonNullable<Json>,"emerg_meta"?: number,"estricto"?: string,"ia"?: NonNullable<Json>,"limite"?: number,"meta"?: string,"notif"?: NonNullable<Json>,"pct"?: NonNullable<Json>,"relaciones"?: (string)[],"setup"?: NonNullable<Json>,"smmlv"?: NonNullable<Json>,"trm"?: NonNullable<Json>,"trm_auto"?: boolean,"umbral"?: number,"updated_at"?: string,"usura"?: number,"usura_auto"?: boolean,"uvt"?: NonNullable<Json>
                  }
                  Update: {
                    "alerta_pres"?: number,"anticipo"?: number,"apps"?: NonNullable<Json>,"book_id"?: string,"corte_q"?: number,"defaults"?: NonNullable<Json>,"emerg_meta"?: number,"estricto"?: string,"ia"?: NonNullable<Json>,"limite"?: number,"meta"?: string,"notif"?: NonNullable<Json>,"pct"?: NonNullable<Json>,"relaciones"?: (string)[],"setup"?: NonNullable<Json>,"smmlv"?: NonNullable<Json>,"trm"?: NonNullable<Json>,"trm_auto"?: boolean,"umbral"?: number,"updated_at"?: string,"usura"?: number,"usura_auto"?: boolean,"uvt"?: NonNullable<Json>
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
                    "book_id": string,"content": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"meta": NonNullable<Json>,"role": string,"thread_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"meta"?: NonNullable<Json>,"role": string,"thread_id": string,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"meta"?: NonNullable<Json>,"role"?: string,"thread_id"?: string,"updated_at"?: string
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
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"titulo": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"titulo"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"titulo"?: string,"updated_at"?: string,"user_id"?: string
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
                    "activo": boolean,"book_id": string,"saldo": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"book_id": string,"saldo"?: number,"updated_at"?: string
                  }
                  Update: {
                    "activo"?: boolean,"book_id"?: string,"saldo"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
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
                    "aporte": Json | null,"book_id": string,"cat_src": string | null,"category_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"descripcion": string,"external_id": string | null,"fecha": string,"fixed_expense_id": string | null,"fondo_valor": number,"hormiga": boolean,"hormiga_razon": string | null,"hormiga_src": string | null,"id": string,"member_id": string | null,"nota": string,"origen": string,"payment_method_id": string | null,"periodo": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aporte"?: Json | null,"book_id": string,"cat_src"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string | null,"fondo_valor"?: number,"hormiga"?: boolean,"hormiga_razon"?: string | null,"hormiga_src"?: string | null,"id"?: string,"member_id"?: string | null,"nota"?: string,"origen"?: string,"payment_method_id"?: string | null,"periodo"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "aporte"?: Json | null,"book_id"?: string,"cat_src"?: string | null,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"external_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string | null,"fondo_valor"?: number,"hormiga"?: boolean,"hormiga_razon"?: string | null,"hormiga_src"?: string | null,"id"?: string,"member_id"?: string | null,"nota"?: string,"origen"?: string,"payment_method_id"?: string | null,"periodo"?: string | null,"updated_at"?: string,"valor"?: number
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
    }
                  ]
                },"extra_incomes": {
                  Row: {
                    "book_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"descripcion": string,"fecha": string,"id": string,"member_id": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"member_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"descripcion"?: string,"fecha"?: string,"id"?: string,"member_id"?: string | null,"updated_at"?: string,"valor"?: number
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
    }
                  ]
                },"family_members": {
                  Row: {
                    "color": string,"created_at": string,"created_by": string | null,"cupo": number,"deleted_at": string | null,"dep_de": string | null,"dep_rel": string | null,"discapacidad": boolean,"doc": string,"es_titular": boolean,"estudia": boolean,"household_id": string,"id": string,"nacimiento": string | null,"nombre": string,"rol": string,"sin_ingresos": boolean,"sort": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"dep_de"?: string | null,"dep_rel"?: string | null,"discapacidad"?: boolean,"doc"?: string,"es_titular"?: boolean,"estudia"?: boolean,"household_id": string,"id"?: string,"nacimiento"?: string | null,"nombre": string,"rol"?: string,"sin_ingresos"?: boolean,"sort"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"cupo"?: number,"deleted_at"?: string | null,"dep_de"?: string | null,"dep_rel"?: string | null,"discapacidad"?: boolean,"doc"?: string,"es_titular"?: boolean,"estudia"?: boolean,"household_id"?: string,"id"?: string,"nacimiento"?: string | null,"nombre"?: string,"rol"?: string,"sin_ingresos"?: boolean,"sort"?: number,"updated_at"?: string,"user_id"?: string | null
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
                },"fixed_expense_payments": {
                  Row: {
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expense_id": string | null,"fecha": string,"fixed_expense_id": string,"id": string,"payment_method_id": string | null,"periodo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"fixed_expense_id": string,"id"?: string,"payment_method_id"?: string | null,"periodo": string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"fixed_expense_id"?: string,"id"?: string,"payment_method_id"?: string | null,"periodo"?: string,"updated_at"?: string,"valor"?: number
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
                    "book_id": string,"category_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"desde": string,"dia": number,"dia2": number | null,"fecha_unica": string | null,"frec": string,"id": string,"inicio": string | null,"link_id": string | null,"link_type": string | null,"logo_path": string | null,"mes": number | null,"nombre": string,"payment_method_id": string | null,"proveedor": string,"updated_at": string,"valor": number,"variable": boolean,"vmax": number | null,"vmin": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"desde"?: string,"dia"?: number,"dia2"?: number | null,"fecha_unica"?: string | null,"frec"?: string,"id"?: string,"inicio"?: string | null,"link_id"?: string | null,"link_type"?: string | null,"logo_path"?: string | null,"mes"?: number | null,"nombre": string,"payment_method_id"?: string | null,"proveedor"?: string,"updated_at"?: string,"valor"?: number,"variable"?: boolean,"vmax"?: number | null,"vmin"?: number | null
                  }
                  Update: {
                    "book_id"?: string,"category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"desde"?: string,"dia"?: number,"dia2"?: number | null,"fecha_unica"?: string | null,"frec"?: string,"id"?: string,"inicio"?: string | null,"link_id"?: string | null,"link_type"?: string | null,"logo_path"?: string | null,"mes"?: number | null,"nombre"?: string,"payment_method_id"?: string | null,"proveedor"?: string,"updated_at"?: string,"valor"?: number,"variable"?: boolean,"vmax"?: number | null,"vmin"?: number | null
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
      foreignKeyName: "fixed_expenses_payment_method_id_fkey"
      columns: ["payment_method_id"]
isOneToOne: false
      referencedRelation: "payment_methods"
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
                },"goals": {
                  Row: {
                    "ahorrado": number,"book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"fecha": string | null,"icon": string,"id": string,"nombre": string,"objetivo": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ahorrado"?: number,"book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string | null,"icon"?: string,"id"?: string,"nombre": string,"objetivo"?: number,"updated_at"?: string
                  }
                  Update: {
                    "ahorrado"?: number,"book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"fecha"?: string | null,"icon"?: string,"id"?: string,"nombre"?: string,"objetivo"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
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
                },"household_invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"household_id": string,"id": string,"invited_by": string | null,"role": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"household_id": string,"id"?: string,"invited_by"?: string | null,"role"?: string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"household_id"?: string,"id"?: string,"invited_by"?: string | null,"role"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_invitations_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "created_at": string,"household_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"household_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"role"?: string,"user_id"?: string
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
                    "activo": boolean,"book_id": string,"bruto": number | null,"category_id": string | null,"concepto": string,"created_at": string,"created_by": string | null,"currency": string,"deducciones": Json | null,"deleted_at": string | null,"dia": number,"frec": string,"id": string,"member_id": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"book_id": string,"bruto"?: number | null,"category_id"?: string | null,"concepto": string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducciones"?: Json | null,"deleted_at"?: string | null,"dia"?: number,"frec"?: string,"id"?: string,"member_id"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "activo"?: boolean,"book_id"?: string,"bruto"?: number | null,"category_id"?: string | null,"concepto"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deducciones"?: Json | null,"deleted_at"?: string | null,"dia"?: number,"frec"?: string,"id"?: string,"member_id"?: string | null,"updated_at"?: string,"valor"?: number
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
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"expense_id": string | null,"fecha": string,"id": string,"loan_id": string,"modo": string | null,"nota": string,"tipo": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"loan_id": string,"modo"?: string | null,"nota"?: string,"tipo"?: string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"expense_id"?: string | null,"fecha"?: string,"id"?: string,"loan_id"?: string,"modo"?: string | null,"nota"?: string,"tipo"?: string,"updated_at"?: string,"valor"?: number
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
    }
                  ]
                },"loans": {
                  Row: {
                    "book_id": string,"cerrado_at": string | null,"concepto": string,"contact_id": string | null,"created_at": string,"created_by": string | null,"cuota_fija": number | null,"currency": string,"deleted_at": string | null,"entity_id": string | null,"extra": number,"frec": string,"id": string,"inicio": string,"kind": string,"monto": number,"nota": string,"plazo": number,"prenda": Json | null,"sistema": string,"tasa": number,"tasa_ea": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"cerrado_at"?: string | null,"concepto"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuota_fija"?: number | null,"currency"?: string,"deleted_at"?: string | null,"entity_id"?: string | null,"extra"?: number,"frec"?: string,"id"?: string,"inicio"?: string,"kind": string,"monto"?: number,"nota"?: string,"plazo"?: number,"prenda"?: Json | null,"sistema"?: string,"tasa"?: number,"tasa_ea"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "book_id"?: string,"cerrado_at"?: string | null,"concepto"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"cuota_fija"?: number | null,"currency"?: string,"deleted_at"?: string | null,"entity_id"?: string | null,"extra"?: number,"frec"?: string,"id"?: string,"inicio"?: string,"kind"?: string,"monto"?: number,"nota"?: string,"plazo"?: number,"prenda"?: Json | null,"sistema"?: string,"tasa"?: number,"tasa_ea"?: number | null,"updated_at"?: string
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
                    "book_id": string,"email_to": string | null,"frecuencia": string,"hora": number,"matriz": NonNullable<Json>,"ocultar_montos": boolean,"silencio": NonNullable<Json>,"timezone": string,"updated_at": string,"user_id": string,"whatsapp_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"email_to"?: string | null,"frecuencia"?: string,"hora"?: number,"matriz"?: NonNullable<Json>,"ocultar_montos"?: boolean,"silencio"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id": string,"whatsapp_to"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"email_to"?: string | null,"frecuencia"?: string,"hora"?: number,"matriz"?: NonNullable<Json>,"ocultar_montos"?: boolean,"silencio"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string,"user_id"?: string,"whatsapp_to"?: string | null
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
      foreignKeyName: "payment_methods_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "books"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"ciudad": string,"created_at": string,"deletion_requested_at": string | null,"digitos": string,"direccion": NonNullable<Json>,"doc": string,"doc_tipo": string,"email": string | null,"id": string,"last_book_id": string | null,"nombre": string,"ocupacion": string,"riesgo": string,"telefono": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"ciudad"?: string,"created_at"?: string,"deletion_requested_at"?: string | null,"digitos"?: string,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string | null,"id": string,"last_book_id"?: string | null,"nombre"?: string,"ocupacion"?: string,"riesgo"?: string,"telefono"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"ciudad"?: string,"created_at"?: string,"deletion_requested_at"?: string | null,"digitos"?: string,"direccion"?: NonNullable<Json>,"doc"?: string,"doc_tipo"?: string,"email"?: string | null,"id"?: string,"last_book_id"?: string | null,"nombre"?: string,"ocupacion"?: string,"riesgo"?: string,"telefono"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
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
                    "fecha": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha": string,"valor": number
                  }
                  Update: {
                    "fecha"?: string,"valor"?: number
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
                    "book_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"descripcion": string,"entre": (string)[],"expense_id": string | null,"fecha": string,"group_id": string,"id": string,"paga": string,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"entre"?: (string)[],"expense_id"?: string | null,"fecha"?: string,"group_id": string,"id"?: string,"paga": string,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "book_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"descripcion"?: string,"entre"?: (string)[],"expense_id"?: string | null,"fecha"?: string,"group_id"?: string,"id"?: string,"paga"?: string,"updated_at"?: string,"valor"?: number
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
                    "activa": boolean,"book_id": string,"category_id": string | null,"ciclo": string,"comparte": number,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"id": string,"logo_path": string | null,"nombre": string,"payment_method_id": string | null,"proximo": string | null,"updated_at": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activa"?: boolean,"book_id": string,"category_id"?: string | null,"ciclo"?: string,"comparte"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nombre": string,"payment_method_id"?: string | null,"proximo"?: string | null,"updated_at"?: string,"valor"?: number
                  }
                  Update: {
                    "activa"?: boolean,"book_id"?: string,"category_id"?: string | null,"ciclo"?: string,"comparte"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"logo_path"?: string | null,"nombre"?: string,"payment_method_id"?: string | null,"proximo"?: string | null,"updated_at"?: string,"valor"?: number
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
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"book_household":
{ Args: { "bk": string }; Returns: string
                           },
"create_book":
{ Args: { "p_household": string,"p_icon"?: string,"p_nombre": string,"p_tipo"?: string }; Returns: string
                           },
"create_household":
{ Args: { "p_libro"?: string,"p_nombre": string }; Returns: string
                           },
"fund_save":
{ Args: { "p_book": string,"p_fecha": string,"p_nota"?: string,"p_valor": number }; Returns: number
                           },
"fund_use":
{ Args: { "p_book": string,"p_desc": string,"p_fecha": string,"p_medio"?: string,"p_valor": number }; Returns: Json
                           },
"is_book_member":
{ Args: { "bk": string,"min_role"?: string }; Returns: boolean
                           },
"is_household_member":
{ Args: { "hh": string,"min_role"?: string }; Returns: boolean
                           },
"pay_fixed_expense":
{ Args: { "p_desc_suffix"?: string,"p_fecha": string,"p_fixed": string,"p_medio"?: string,"p_periodo": string,"p_valor": number }; Returns: Json
                           },
"role_rank":
{ Args: { "r": string }; Returns: number
                           },
"seed_book_defaults":
{ Args: { "bk": string }; Returns: undefined
                           },
"try_uuid":
{ Args: { "t": string }; Returns: string
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
