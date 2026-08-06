export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      automacoes: {
        Row: {
          ativo: boolean
          conexoes: Json
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          nos: Json
          ultima_execucao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conexoes?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          nos?: Json
          ultima_execucao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conexoes?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          nos?: Json
          ultima_execucao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes_config: {
        Row: {
          id: boolean
          segredo: string
        }
        Insert: {
          id?: boolean
          segredo: string
        }
        Update: {
          id?: boolean
          segredo?: string
        }
        Relationships: []
      }
      automacoes_credenciais: {
        Row: {
          config: Json
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_credenciais_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes_execucoes: {
        Row: {
          automacao_id: string
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          resultado: Json | null
          status: string
        }
        Insert: {
          automacao_id: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resultado?: Json | null
          status?: string
        }
        Update: {
          automacao_id?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          resultado?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_execucoes_automacao_id_fkey"
            columns: ["automacao_id"]
            isOneToOne: false
            referencedRelation: "automacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          acao_conversao: string | null
          acao_lead: string | null
          ad_account_id: string
          created_at: string
          erro_sincronizacao: string | null
          id: string
          identificador: string
          instagram_business_account_id: string | null
          instagram_erro_sincronizacao: string | null
          instagram_kpis: Json | null
          instagram_ultima_sincronizacao: string | null
          investimento_mensal: number
          meta_faturamento: number
          metricas_kpis: Json | null
          nome: string
          token_atualizado_em: string | null
          ultima_sincronizacao: string | null
          updated_at: string
        }
        Insert: {
          acao_conversao?: string | null
          acao_lead?: string | null
          ad_account_id?: string
          created_at?: string
          erro_sincronizacao?: string | null
          id?: string
          identificador: string
          instagram_business_account_id?: string | null
          instagram_erro_sincronizacao?: string | null
          instagram_kpis?: Json | null
          instagram_ultima_sincronizacao?: string | null
          investimento_mensal?: number
          meta_faturamento?: number
          metricas_kpis?: Json | null
          nome: string
          token_atualizado_em?: string | null
          ultima_sincronizacao?: string | null
          updated_at?: string
        }
        Update: {
          acao_conversao?: string | null
          acao_lead?: string | null
          ad_account_id?: string
          created_at?: string
          erro_sincronizacao?: string | null
          id?: string
          identificador?: string
          instagram_business_account_id?: string | null
          instagram_erro_sincronizacao?: string | null
          instagram_kpis?: Json | null
          instagram_ultima_sincronizacao?: string | null
          investimento_mensal?: number
          meta_faturamento?: number
          metricas_kpis?: Json | null
          nome?: string
          token_atualizado_em?: string | null
          ultima_sincronizacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clientes_secrets: {
        Row: {
          cliente_id: string
          created_at: string
          meta_token: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          meta_token?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          meta_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_secrets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_anexos: {
        Row: {
          caminho: string
          cartao_id: string
          created_at: string
          enviado_por: string | null
          id: string
          nome: string
          tamanho: number
        }
        Insert: {
          caminho: string
          cartao_id: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          nome: string
          tamanho?: number
        }
        Update: {
          caminho?: string
          cartao_id?: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          nome?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_anexos_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_cartao_etiquetas: {
        Row: {
          cartao_id: string
          etiqueta_id: string
        }
        Insert: {
          cartao_id: string
          etiqueta_id: string
        }
        Update: {
          cartao_id?: string
          etiqueta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_cartao_etiquetas_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_cartao_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "fluxo_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_cartoes: {
        Row: {
          agendamento: string | null
          cliente_id: string | null
          coluna_id: string
          created_at: string
          descricao: string | null
          entrega_arte: string | null
          entrega_texto: string | null
          id: string
          ordem: number
          prazo: string | null
          prioridade: string | null
          publicacao: string | null
          tipo_post: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          agendamento?: string | null
          cliente_id?: string | null
          coluna_id: string
          created_at?: string
          descricao?: string | null
          entrega_arte?: string | null
          entrega_texto?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: string | null
          publicacao?: string | null
          tipo_post?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          agendamento?: string | null
          cliente_id?: string | null
          coluna_id?: string
          created_at?: string
          descricao?: string | null
          entrega_arte?: string | null
          entrega_texto?: string | null
          id?: string
          ordem?: number
          prazo?: string | null
          prioridade?: string | null
          publicacao?: string | null
          tipo_post?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_cartoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_cartoes_coluna_id_fkey"
            columns: ["coluna_id"]
            isOneToOne: false
            referencedRelation: "fluxo_colunas"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_checklist: {
        Row: {
          cartao_id: string
          feito: boolean
          id: string
          ordem: number
          texto: string
        }
        Insert: {
          cartao_id: string
          feito?: boolean
          id?: string
          ordem?: number
          texto: string
        }
        Update: {
          cartao_id?: string
          feito?: boolean
          id?: string
          ordem?: number
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_checklist_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_colunas: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      fluxo_comentarios: {
        Row: {
          autor_id: string
          cartao_id: string
          created_at: string
          id: string
          texto: string
        }
        Insert: {
          autor_id: string
          cartao_id: string
          created_at?: string
          id?: string
          texto: string
        }
        Update: {
          autor_id?: string
          cartao_id?: string
          created_at?: string
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_comentarios_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      fluxo_etiquetas: {
        Row: {
          cor: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      fluxo_responsaveis: {
        Row: {
          cartao_id: string
          perfil_id: string
        }
        Insert: {
          cartao_id: string
          perfil_id: string
        }
        Update: {
          cartao_id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_responsaveis_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "fluxo_cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fluxo_responsaveis_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_campanhas: {
        Row: {
          acoes: Json
          atualizado_em: string
          campanha_id: string
          campanha_nome: string
          cliente_id: string
          cliques: number
          conversoes: number
          data: string
          id: string
          impressoes: number
          investimento: number
          leads: number
          status: string
          video_p100: number
          video_p25: number
          video_p50: number
          video_p75: number
        }
        Insert: {
          acoes?: Json
          atualizado_em?: string
          campanha_id: string
          campanha_nome?: string
          cliente_id: string
          cliques?: number
          conversoes?: number
          data: string
          id?: string
          impressoes?: number
          investimento?: number
          leads?: number
          status?: string
          video_p100?: number
          video_p25?: number
          video_p50?: number
          video_p75?: number
        }
        Update: {
          acoes?: Json
          atualizado_em?: string
          campanha_id?: string
          campanha_nome?: string
          cliente_id?: string
          cliques?: number
          conversoes?: number
          data?: string
          id?: string
          impressoes?: number
          investimento?: number
          leads?: number
          status?: string
          video_p100?: number
          video_p25?: number
          video_p50?: number
          video_p75?: number
        }
        Relationships: [
          {
            foreignKeyName: "metricas_campanhas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_diarias: {
        Row: {
          acoes: Json
          atualizado_em: string
          cliente_id: string
          cliques: number
          conversoes: number
          created_at: string
          data: string
          id: string
          impressoes: number
          investimento: number
          leads: number
          video_p100: number
          video_p25: number
          video_p50: number
          video_p75: number
        }
        Insert: {
          acoes?: Json
          atualizado_em?: string
          cliente_id: string
          cliques?: number
          conversoes?: number
          created_at?: string
          data: string
          id?: string
          impressoes?: number
          investimento?: number
          leads?: number
          video_p100?: number
          video_p25?: number
          video_p50?: number
          video_p75?: number
        }
        Update: {
          acoes?: Json
          atualizado_em?: string
          cliente_id?: string
          cliques?: number
          conversoes?: number
          created_at?: string
          data?: string
          id?: string
          impressoes?: number
          investimento?: number
          leads?: number
          video_p100?: number
          video_p25?: number
          video_p50?: number
          video_p75?: number
        }
        Relationships: [
          {
            foreignKeyName: "metricas_diarias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_instagram_diarias: {
        Row: {
          alcance: number
          atualizado_em: string
          cliente_id: string
          comentarios: number
          compartilhamentos: number
          curtidas: number
          data: string
          id: string
          seguidores: number
          visitas_perfil: number
        }
        Insert: {
          alcance?: number
          atualizado_em?: string
          cliente_id: string
          comentarios?: number
          compartilhamentos?: number
          curtidas?: number
          data: string
          id?: string
          seguidores?: number
          visitas_perfil?: number
        }
        Update: {
          alcance?: number
          atualizado_em?: string
          cliente_id?: string
          comentarios?: number
          compartilhamentos?: number
          curtidas?: number
          data?: string
          id?: string
          seguidores?: number
          visitas_perfil?: number
        }
        Relationships: [
          {
            foreignKeyName: "metricas_instagram_diarias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      metricas_instagram_posts: {
        Row: {
          alcance: number
          atualizado_em: string
          cliente_id: string
          comentarios: number
          compartilhamentos: number
          curtidas: number
          id: string
          legenda: string
          media_id: string
          permalink: string | null
          publicado_em: string | null
          tipo: string
        }
        Insert: {
          alcance?: number
          atualizado_em?: string
          cliente_id: string
          comentarios?: number
          compartilhamentos?: number
          curtidas?: number
          id?: string
          legenda?: string
          media_id: string
          permalink?: string | null
          publicado_em?: string | null
          tipo?: string
        }
        Update: {
          alcance?: number
          atualizado_em?: string
          cliente_id?: string
          comentarios?: number
          compartilhamentos?: number
          curtidas?: number
          id?: string
          legenda?: string
          media_id?: string
          permalink?: string | null
          publicado_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "metricas_instagram_posts_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cliente_id: string | null
          created_at: string
          email: string
          equipe_role: Database["public"]["Enums"]["equipe_role"] | null
          id: string
          nome: string
          permissoes: Json
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          avatar_url?: string | null
          cliente_id?: string | null
          created_at?: string
          email?: string
          equipe_role?: Database["public"]["Enums"]["equipe_role"] | null
          id: string
          nome?: string
          permissoes?: Json
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          avatar_url?: string | null
          cliente_id?: string | null
          created_at?: string
          email?: string
          equipe_role?: Database["public"]["Enums"]["equipe_role"] | null
          id?: string
          nome?: string
          permissoes?: Json
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "cliente" | "agencia"
      equipe_role:
        | "super_admin"
        | "gestor"
        | "analista"
        | "admin"
        | "gestor_trafego"
        | "social_media"
        | "gerente_projeto"
        | "designer"
        | "editor_video"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["cliente", "agencia"],
      equipe_role: [
        "super_admin",
        "gestor",
        "analista",
        "admin",
        "gestor_trafego",
        "social_media",
        "gerente_projeto",
        "designer",
        "editor_video",
      ],
    },
  },
} as const
