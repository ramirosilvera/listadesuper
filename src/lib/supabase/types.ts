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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_code: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_code?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_code?: string | null
          name?: string
        }
        Relationships: []
      }
      product_expirations: {
        Row: {
          confirmed_by_user: boolean
          created_at: string
          expiration_date: string
          household_id: string
          id: string
          product_id: string
          purchase_item_id: string | null
          quantity: number
          status: string
        }
        Insert: {
          confirmed_by_user?: boolean
          created_at?: string
          expiration_date: string
          household_id: string
          id?: string
          product_id: string
          purchase_item_id?: string | null
          quantity?: number
          status?: string
        }
        Update: {
          confirmed_by_user?: boolean
          created_at?: string
          expiration_date?: string
          household_id?: string
          id?: string
          product_id?: string
          purchase_item_id?: string | null
          quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_expirations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_expirations_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suggestion_dismissals: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          dismissed_value: number | null
          household_id: string
          id: string
          product_id: string
          suggestion_type: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          dismissed_value?: number | null
          household_id: string
          id?: string
          product_id: string
          suggestion_type: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          dismissed_value?: number | null
          household_id?: string
          id?: string
          product_id?: string
          suggestion_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suggestion_dismissals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suggestion_dismissals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_suggestion_dismissals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suggestion_dismissals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          archived: boolean
          barcode: string | null
          category_id: string | null
          created_at: string
          default_shelf_life_days: number | null
          household_id: string
          id: string
          low_stock_threshold: number | null
          name: string
          notes: string | null
          restock_cycle_days: number | null
          unit_label: string
        }
        Insert: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_shelf_life_days?: number | null
          household_id: string
          id?: string
          low_stock_threshold?: number | null
          name: string
          notes?: string | null
          restock_cycle_days?: number | null
          unit_label?: string
        }
        Update: {
          archived?: boolean
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          default_shelf_life_days?: number | null
          household_id?: string
          id?: string
          low_stock_threshold?: number | null
          name?: string
          notes?: string | null
          restock_cycle_days?: number | null
          unit_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "spending_by_category_30d"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          subtotal: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          subtotal?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          subtotal?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          purchased_at: string
          receipt_image_path: string | null
          source: string
          store_id: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          purchased_at?: string
          receipt_image_path?: string | null
          source?: string
          store_id?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          purchased_at?: string
          receipt_image_path?: string | null
          source?: string
          store_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          added_by: string
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          list_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          added_by: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          list_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          added_by?: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          list_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          name?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          household_id: string
          id: string
          product_id: string
          purchase_item_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          household_id: string
          id?: string
          product_id: string
          purchase_item_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          household_id?: string
          id?: string
          product_id?: string
          purchase_item_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_membership: {
        Row: {
          household_id: string | null
          household_invite_code: string | null
          household_name: string | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      product_expirations_upcoming: {
        Row: {
          confirmed_by_user: boolean | null
          days_until: number | null
          expiration_date: string | null
          household_id: string | null
          id: string | null
          level: string | null
          product_id: string | null
          product_name: string | null
          purchase_item_id: string | null
          quantity: number | null
          unit_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_expirations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_expirations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_expirations_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_replenishment: {
        Row: {
          avg_daily_consumption: number | null
          days_since_last_restock: number | null
          estimated_days_remaining: number | null
          household_id: string | null
          last_restocked_at: string | null
          low_stock_threshold: number | null
          name: string | null
          product_id: string | null
          quantity_on_hand: number | null
          restock_cycle_days: number | null
          restock_reason: string | null
          should_restock: boolean | null
          unit_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          household_id: string | null
          last_movement_at: string | null
          product_id: string | null
          quantity_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_replenishment"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "top_products_90d"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_suggestions: {
        Row: {
          current_value: number | null
          evidence_count: number | null
          household_id: string | null
          name: string | null
          product_id: string | null
          reason: string | null
          suggested_value: number | null
          suggestion_type: string | null
        }
        Relationships: []
      }
      spending_by_category_30d: {
        Row: {
          category_id: string | null
          category_name: string | null
          household_id: string | null
          item_count: number | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      spending_by_week: {
        Row: {
          household_id: string | null
          purchase_count: number | null
          total_amount: number | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      top_products_90d: {
        Row: {
          household_id: string | null
          product_id: string | null
          product_name: string | null
          purchase_count: number | null
          total_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_delta: number
          p_household_id: string
          p_product_id: string
          p_reason: string
        }
        Returns: string
      }
      apply_product_suggestion: {
        Args: {
          p_product_id: string
          p_suggestion_type: string
          p_value?: number
        }
        Returns: undefined
      }
      create_household: { Args: { p_name: string }; Returns: string }
      dismiss_product_suggestion: {
        Args: {
          p_product_id: string
          p_suggestion_type: string
          p_value?: number
        }
        Returns: undefined
      }
      generate_invite_code: { Args: never; Returns: string }
      increment_list_item_quantity: {
        Args: { p_delta: number; p_item_id: string }
        Returns: number
      }
      join_household_by_code: {
        Args: { p_invite_code: string }
        Returns: string
      }
      record_purchase: {
        Args: {
          p_confirm_duplicate?: boolean
          p_household_id: string
          p_items: Json
          p_purchased_at: string
          p_receipt_image_path: string
          p_source: string
          p_store_id: string
        }
        Returns: string
      }
      resolve_expiration: {
        Args: { p_expiration_id: string; p_status: string }
        Returns: undefined
      }
      seed_initial_stock: { Args: { p_household_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
