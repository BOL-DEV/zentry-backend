const createExtensionSql = `CREATE EXTENSION IF NOT EXISTS pgcrypto`;

const createCommonTablesSql = [
  `
  CREATE TABLE IF NOT EXISTS organizers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT NOT NULL,
    logo_public_id TEXT,
    banner_url TEXT NOT NULL,
    banner_public_id TEXT,
    hero_title TEXT NOT NULL,
    hero_subtitle TEXT NOT NULL,
    about TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    location TEXT NOT NULL,
    bank_details JSONB,
    staff_session_limit INTEGER NOT NULL DEFAULT 3,
    organizer_session_limit INTEGER NOT NULL DEFAULT 1,
    platform_fee_override JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS dashboard_users (
    id TEXT PRIMARY KEY,
    organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    user_agent TEXT,
    ip_address TEXT,
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
    organizer_id TEXT REFERENCES organizers(id) ON DELETE SET NULL,
    role TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    user_agent TEXT,
    ip_address TEXT,
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    location TEXT NOT NULL,
    poster_url TEXT NOT NULL,
    poster_public_id TEXT,
    dress_code TEXT NOT NULL,
    policies TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS ticket_types (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    quantity_available INTEGER NOT NULL,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ticket_types_event_name_unique UNIQUE (event_id, name)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_phone TEXT NOT NULL DEFAULT '',
    total_amount NUMERIC(12,2) NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    payment_reference TEXT UNIQUE,
    access_token TEXT UNIQUE,
    reservation_expires_at TIMESTAMPTZ,
    reservation_released_at TIMESTAMPTZ,
    payment_gateway TEXT NOT NULL DEFAULT 'squad',
    paid_at TIMESTAMPTZ,
    platform_fee_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    squad_gateway_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    squad_transfer_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    settlement_status TEXT NOT NULL DEFAULT 'pending',
    settlement_batch_id TEXT NOT NULL DEFAULT '',
    settlement_date TIMESTAMPTZ,
    settlement_last_error TEXT NOT NULL DEFAULT '',
    settlement_last_attempt_at TIMESTAMPTZ,
    organizer_payout_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
    ticket_type_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_type_id TEXT NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    ticket_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'valid',
    checked_in_at TIMESTAMPTZ,
    verified_by TEXT REFERENCES dashboard_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS galleries (
    id TEXT PRIMARY KEY,
    organizer_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_public_id TEXT,
    caption TEXT NOT NULL DEFAULT '',
    alt_text TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT galleries_organizer_image_unique UNIQUE (organizer_id, image_url)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS organizer_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    logo_url TEXT NOT NULL,
    logo_public_id TEXT,
    banner_url TEXT NOT NULL,
    banner_public_id TEXT,
    hero_title TEXT NOT NULL,
    hero_subtitle TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    about TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    bank_details JSONB,
    preferred_slug TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '',
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    created_organizer_id TEXT REFERENCES organizers(id) ON DELETE SET NULL,
    created_dashboard_user_id TEXT REFERENCES dashboard_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS platform_fee_settings (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    flat_fee_below_threshold NUMERIC(12,2) NOT NULL,
    threshold_amount NUMERIC(12,2) NOT NULL,
    percent_above_threshold NUMERIC(12,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
].join("\n");

const createIndexesSql = [
  `CREATE INDEX IF NOT EXISTS idx_dashboard_users_organizer_id ON dashboard_users(organizer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_sessions_organizer_id ON user_sessions(organizer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_organizer_id_date ON events(organizer_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id_order ON ticket_types(event_id, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event_id_created_at ON orders(event_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event_payment_status ON orders(event_id, payment_status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_event_settlement_status ON orders(event_id, settlement_status, paid_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_event_id_status ON tickets(event_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_event_id_checked_in_at ON tickets(event_id, checked_in_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_galleries_organizer_id_order ON galleries(organizer_id, display_order)`,
  `CREATE INDEX IF NOT EXISTS idx_organizer_requests_status_created_at ON organizer_requests(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_organizer_requests_created_at ON organizer_requests(created_at DESC)`,
].join(";\n");

export const ensureSchemaSql = [
  createExtensionSql,
  createCommonTablesSql,
  createIndexesSql,
].join(";\n");

