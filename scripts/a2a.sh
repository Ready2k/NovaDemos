#!/bin/bash

# A2A Multi-Agent System Control Script

set -e

COMPOSE_FILE="docker-compose-a2a.yml"

function show_help() {
    echo "Usage: ./a2a.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build       - Build all services"
    echo "  start       - Start all services"
    echo "  stop        - Stop all services"
    echo "  restart     - Restart all services"
    echo "  logs        - Show logs from all services"
    echo "  status      - Show status of all services"
    echo "  clean       - Stop and remove all containers, networks, and volumes"
    echo "  test        - Run health checks on all services"
    echo ""
}

function build_services() {
    echo "🛠️  Building A2A Multi-Agent System..."
    docker-compose -f "$COMPOSE_FILE" build
    echo "✅ Build complete."
}

function start_services() {
    echo "🚀 Starting A2A Multi-Agent System..."
    docker-compose -f "$COMPOSE_FILE" up -d
    echo "✅ Services started."
    echo ""
    echo "📊 Service URLs:"
    echo "  Frontend:     http://localhost:3000"
    echo "  Gateway:      http://localhost:8080"
    echo "  Triage Agent: http://localhost:8081"
    echo "  Banking:      http://localhost:8082"
    echo "  Mortgage:     http://localhost:8083"
    echo "  IDV:          http://localhost:8084"
    echo "  Disputes:     http://localhost:8085"
    echo "  Local Tools:  http://localhost:9000"
    echo "  Redis:        localhost:6379"
}

function stop_services() {
    echo "🛑 Stopping A2A Multi-Agent System..."
    docker-compose -f "$COMPOSE_FILE" down
    echo "✅ Services stopped."
}

function restart_services() {
    stop_services
    start_services
}

function show_logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f
}

function show_status() {
    echo "📊 A2A Multi-Agent System Status:"
    docker-compose -f "$COMPOSE_FILE" ps
}

function clean_all() {
    echo "🧹 Cleaning up A2A Multi-Agent System..."
    docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans
    echo "✅ Cleanup complete."
}

function test_health() {
    echo "🏥 Running health checks..."
    echo ""
    
    services=(
        "Gateway:http://localhost:8080/health"
        "Triage:http://localhost:8081/health"
        "Banking:http://localhost:8082/health"
        "Mortgage:http://localhost:8083/health"
        "IDV:http://localhost:8084/health"
        "Disputes:http://localhost:8085/health"
        "LocalTools:http://localhost:9000/health"
    )
    
    for service in "${services[@]}"; do
        name="${service%%:*}"
        url="${service#*:}"
        
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo "✅ $name is healthy"
        else
            echo "❌ $name is not responding"
        fi
    done
}

# Main command handling
case "${1:-help}" in
    build)
        build_services
        ;;
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    clean)
        clean_all
        ;;
    test)
        test_health
        ;;
    help|*)
        show_help
        ;;
esac
