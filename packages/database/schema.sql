-- Indian Rummy PostgreSQL Database Schema

CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) UNIQUE NOT NULL,
    phase VARCHAR(30) NOT NULL DEFAULT 'LOBBY',
    round INT NOT NULL DEFAULT 1,
    max_rounds INT NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL,
    round_number INT NOT NULL,
    wild_joker VARCHAR(15),
    winner_id VARCHAR(50),
    winner_name VARCHAR(100),
    scores_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS round_player_scores (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL,
    round_number INT NOT NULL,
    player_id VARCHAR(50) NOT NULL,
    player_name VARCHAR(100) NOT NULL,
    round_score INT NOT NULL,
    total_score INT NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_audit_log (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL,
    round_number INT,
    player_id VARCHAR(50),
    action_type VARCHAR(50) NOT NULL,
    payload_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rounds_room ON game_rounds(room_code);
CREATE INDEX IF NOT EXISTS idx_scores_room ON round_player_scores(room_code, round_number);
CREATE INDEX IF NOT EXISTS idx_audit_room ON game_audit_log(room_code);

