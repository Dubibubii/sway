#!/bin/bash

# Start PostgreSQL if not running
if ! pg_isready &>/dev/null; then
    echo "Starting PostgreSQL..."
    sudo service postgresql start
fi

# Load environment variables and start development server
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sway
export PORT=3000
export HELIUS_API_KEY=59f509f2-470e-41d8-9cbf-6a42eb4d47a7
export VITE_HELIUS_API_KEY=59f509f2-470e-41d8-9cbf-6a42eb4d47a7
export VITE_PRIVY_CLIENT_ID=client-WY6U5BvWsPaRsDT8FzRAvB9PFrNviAAWSBfwXr6ZYWPK5

echo "Starting development server on http://localhost:3000"
npm run dev
