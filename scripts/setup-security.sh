#!/bin/bash

# Cloud IDE Orchestrator - Security Setup Script
# This script sets up the security infrastructure for container isolation

set -e

echo "🔒 Setting up Cloud IDE Orchestrator Security Infrastructure..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_success "Docker is running"

# Create isolated network for containers
print_status "Creating isolated Docker network..."

# Remove existing network if it exists
if docker network ls | grep -q "cloud-ide-isolated"; then
    print_warning "Removing existing cloud-ide-isolated network..."
    docker network rm cloud-ide-isolated || true
fi

# Create the isolated network
docker network create \
    --driver bridge \
    --internal \
    --subnet=172.20.0.0/16 \
    --gateway=172.20.0.1 \
    --opt com.docker.network.bridge.enable_icc=false \
    --opt com.docker.network.bridge.enable_ip_masquerade=false \
    --opt com.docker.network.driver.mtu=1500 \
    --label cloud-ide-orchestrator.managed=true \
    --label cloud-ide-orchestrator.type=isolated \
    cloud-ide-isolated

print_success "Created isolated network: cloud-ide-isolated"

# Create main network for containers (if it doesn't exist)
print_status "Creating main Docker network..."

if ! docker network ls | grep -q "cloud-ide-network"; then
    docker network create \
        --driver bridge \
        --subnet=172.19.0.0/16 \
        --gateway=172.19.0.1 \
        --label cloud-ide-orchestrator.managed=true \
        cloud-ide-network
    
    print_success "Created main network: cloud-ide-network"
else
    print_warning "Main network cloud-ide-network already exists"
fi

# Set up security directories
print_status "Setting up security directories..."

# Create directories for security logs and monitoring
sudo mkdir -p /var/log/cloud-ide-orchestrator/security
sudo mkdir -p /var/lib/cloud-ide-orchestrator/security
sudo mkdir -p /etc/cloud-ide-orchestrator/security

# Set proper permissions
sudo chown -R $USER:$USER /var/log/cloud-ide-orchestrator
sudo chown -R $USER:$USER /var/lib/cloud-ide-orchestrator
sudo chmod -R 755 /var/log/cloud-ide-orchestrator
sudo chmod -R 755 /var/lib/cloud-ide-orchestrator

print_success "Created security directories"

# Create security configuration file
print_status "Creating security configuration..."

cat > /tmp/security-config.json << EOF
{
  "networkSecurity": {
    "allowedNetworks": ["127.0.0.1", "localhost"],
    "blockedPorts": [22, 23, 25, 53, 80, 443, 993, 995],
    "enableNetworkIsolation": true
  },
  "fileSystemSecurity": {
    "readOnlyMounts": ["/etc", "/usr", "/bin", "/sbin", "/lib", "/lib64"],
    "restrictedPaths": ["/proc", "/sys", "/dev", "/run", "/var/run"],
    "maxFileSize": 104857600
  },
  "resourceLimits": {
    "maxMemoryPerContainer": "2g",
    "maxCpuPerContainer": "1.0",
    "maxDiskUsage": "5g"
  },
  "terminalSecurity": {
    "allowedCommands": [
      "ls", "cd", "pwd", "cat", "less", "more", "head", "tail",
      "grep", "find", "which", "echo", "printf",
      "git", "npm", "yarn", "node", "python", "pip",
      "make", "cmake", "gcc", "g++", "javac", "java",
      "vim", "nano", "emacs", "code"
    ],
    "blockedCommands": [
      "rm -rf /", "dd if=", "mkfs", "fdisk",
      "iptables", "netstat", "ss", "lsof",
      "docker", "kubectl", "systemctl", "service",
      "mount", "umount", "sudo", "su"
    ],
    "shellTimeout": 3600
  },
  "monitoring": {
    "logSecurityEvents": true,
    "alertOnViolations": true,
    "maxViolationsPerUser": 10
  }
}
EOF

sudo mv /tmp/security-config.json /etc/cloud-ide-orchestrator/security/config.json
sudo chown $USER:$USER /etc/cloud-ide-orchestrator/security/config.json
sudo chmod 644 /etc/cloud-ide-orchestrator/security/config.json

print_success "Created security configuration file"

# Create AppArmor profile for containers (if AppArmor is available)
if command -v aa-status >/dev/null 2>&1; then
    print_status "Setting up AppArmor profile for containers..."
    
    cat > /tmp/cloud-ide-container << 'EOF'
#include <tunables/global>

profile cloud-ide-container flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>
  
  # Deny dangerous capabilities
  deny capability sys_admin,
  deny capability sys_module,
  deny capability sys_rawio,
  deny capability sys_ptrace,
  deny capability dac_override,
  deny capability dac_read_search,
  deny capability fowner,
  deny capability fsetid,
  deny capability kill,
  deny capability setgid,
  deny capability setuid,
  deny capability net_bind_service,
  deny capability net_broadcast,
  deny capability net_admin,
  deny capability net_raw,
  deny capability ipc_lock,
  deny capability ipc_owner,
  deny capability sys_chroot,
  deny capability sys_boot,
  deny capability sys_nice,
  deny capability sys_resource,
  deny capability sys_time,
  deny capability sys_tty_config,
  deny capability mknod,
  deny capability lease,
  deny capability audit_write,
  deny capability audit_control,
  deny capability setfcap,
  deny capability mac_override,
  deny capability mac_admin,
  deny capability syslog,
  deny capability wake_alarm,
  deny capability block_suspend,
  
  # Allow basic file operations in allowed directories
  /home/coder/workspace/** rw,
  /home/coder/.local/share/code-server/** r,
  /tmp/** rw,
  /var/tmp/** rw,
  
  # Read-only access to system directories
  /etc/** r,
  /usr/** r,
  /bin/** r,
  /sbin/** r,
  /lib/** r,
  /lib64/** r,
  
  # Deny access to sensitive system directories
  deny /proc/sys/** w,
  deny /sys/** w,
  deny /dev/** w,
  deny /run/** w,
  deny /var/run/** w,
  
  # Allow network access (will be restricted by Docker networking)
  network inet tcp,
  network inet udp,
  network inet6 tcp,
  network inet6 udp,
  
  # Allow basic process operations
  signal (receive) peer=unconfined,
  signal (send) peer=cloud-ide-container,
  
  # Allow basic file operations
  file,
  
  # Deny mount operations
  deny mount,
  deny umount,
  
  # Deny ptrace
  deny ptrace,
}
EOF

    sudo mv /tmp/cloud-ide-container /etc/apparmor.d/cloud-ide-container
    sudo apparmor_parser -r /etc/apparmor.d/cloud-ide-container
    
    print_success "Created and loaded AppArmor profile"
else
    print_warning "AppArmor not available, skipping profile creation"
fi

# Create seccomp profile for containers
print_status "Creating seccomp security profile..."

cat > /tmp/seccomp-profile.json << 'EOF'
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": [
    "SCMP_ARCH_X86_64",
    "SCMP_ARCH_X86",
    "SCMP_ARCH_X32"
  ],
  "syscalls": [
    {
      "names": [
        "accept",
        "accept4",
        "access",
        "adjtimex",
        "alarm",
        "bind",
        "brk",
        "capget",
        "capset",
        "chdir",
        "chmod",
        "chown",
        "chown32",
        "clock_getres",
        "clock_gettime",
        "clock_nanosleep",
        "close",
        "connect",
        "copy_file_range",
        "creat",
        "dup",
        "dup2",
        "dup3",
        "epoll_create",
        "epoll_create1",
        "epoll_ctl",
        "epoll_ctl_old",
        "epoll_pwait",
        "epoll_wait",
        "epoll_wait_old",
        "eventfd",
        "eventfd2",
        "execve",
        "execveat",
        "exit",
        "exit_group",
        "faccessat",
        "fadvise64",
        "fadvise64_64",
        "fallocate",
        "fanotify_mark",
        "fchdir",
        "fchmod",
        "fchmodat",
        "fchown",
        "fchown32",
        "fchownat",
        "fcntl",
        "fcntl64",
        "fdatasync",
        "fgetxattr",
        "flistxattr",
        "flock",
        "fork",
        "fremovexattr",
        "fsetxattr",
        "fstat",
        "fstat64",
        "fstatat64",
        "fstatfs",
        "fstatfs64",
        "fsync",
        "ftruncate",
        "ftruncate64",
        "futex",
        "getcwd",
        "getdents",
        "getdents64",
        "getegid",
        "getegid32",
        "geteuid",
        "geteuid32",
        "getgid",
        "getgid32",
        "getgroups",
        "getgroups32",
        "getitimer",
        "getpeername",
        "getpgid",
        "getpgrp",
        "getpid",
        "getppid",
        "getpriority",
        "getrandom",
        "getresgid",
        "getresgid32",
        "getresuid",
        "getresuid32",
        "getrlimit",
        "get_robust_list",
        "getrusage",
        "getsid",
        "getsockname",
        "getsockopt",
        "get_thread_area",
        "gettid",
        "gettimeofday",
        "getuid",
        "getuid32",
        "getxattr",
        "inotify_add_watch",
        "inotify_init",
        "inotify_init1",
        "inotify_rm_watch",
        "io_cancel",
        "ioctl",
        "io_destroy",
        "io_getevents",
        "ioprio_get",
        "ioprio_set",
        "io_setup",
        "io_submit",
        "ipc",
        "kill",
        "lchown",
        "lchown32",
        "lgetxattr",
        "link",
        "linkat",
        "listen",
        "listxattr",
        "llistxattr",
        "lremovexattr",
        "lseek",
        "lsetxattr",
        "lstat",
        "lstat64",
        "madvise",
        "memfd_create",
        "mincore",
        "mkdir",
        "mkdirat",
        "mknod",
        "mknodat",
        "mlock",
        "mlock2",
        "mlockall",
        "mmap",
        "mmap2",
        "mprotect",
        "mq_getsetattr",
        "mq_notify",
        "mq_open",
        "mq_timedreceive",
        "mq_timedsend",
        "mq_unlink",
        "mremap",
        "msgctl",
        "msgget",
        "msgrcv",
        "msgsnd",
        "msync",
        "munlock",
        "munlockall",
        "munmap",
        "nanosleep",
        "newfstatat",
        "_newselect",
        "open",
        "openat",
        "pause",
        "pipe",
        "pipe2",
        "poll",
        "ppoll",
        "prctl",
        "pread64",
        "preadv",
        "prlimit64",
        "pselect6",
        "ptrace",
        "pwrite64",
        "pwritev",
        "read",
        "readahead",
        "readlink",
        "readlinkat",
        "readv",
        "recv",
        "recvfrom",
        "recvmmsg",
        "recvmsg",
        "remap_file_pages",
        "removexattr",
        "rename",
        "renameat",
        "renameat2",
        "restart_syscall",
        "rmdir",
        "rt_sigaction",
        "rt_sigpending",
        "rt_sigprocmask",
        "rt_sigqueueinfo",
        "rt_sigreturn",
        "rt_sigsuspend",
        "rt_sigtimedwait",
        "rt_tgsigqueueinfo",
        "sched_getaffinity",
        "sched_getattr",
        "sched_getparam",
        "sched_get_priority_max",
        "sched_get_priority_min",
        "sched_getscheduler",
        "sched_rr_get_interval",
        "sched_setaffinity",
        "sched_setattr",
        "sched_setparam",
        "sched_setscheduler",
        "sched_yield",
        "seccomp",
        "select",
        "semctl",
        "semget",
        "semop",
        "semtimedop",
        "send",
        "sendfile",
        "sendfile64",
        "sendmmsg",
        "sendmsg",
        "sendto",
        "setfsgid",
        "setfsgid32",
        "setfsuid",
        "setfsuid32",
        "setgid",
        "setgid32",
        "setgroups",
        "setgroups32",
        "setitimer",
        "setpgid",
        "setpriority",
        "setregid",
        "setregid32",
        "setresgid",
        "setresgid32",
        "setresuid",
        "setresuid32",
        "setreuid",
        "setreuid32",
        "setrlimit",
        "set_robust_list",
        "setsid",
        "setsockopt",
        "set_thread_area",
        "set_tid_address",
        "setuid",
        "setuid32",
        "setxattr",
        "shmat",
        "shmctl",
        "shmdt",
        "shmget",
        "shutdown",
        "sigaltstack",
        "signalfd",
        "signalfd4",
        "sigreturn",
        "socket",
        "socketcall",
        "socketpair",
        "splice",
        "stat",
        "stat64",
        "statfs",
        "statfs64",
        "statx",
        "symlink",
        "symlinkat",
        "sync",
        "sync_file_range",
        "syncfs",
        "sysinfo",
        "tee",
        "tgkill",
        "time",
        "timer_create",
        "timer_delete",
        "timer_getoverrun",
        "timer_gettime",
        "timer_settime",
        "times",
        "tkill",
        "truncate",
        "truncate64",
        "ugetrlimit",
        "umask",
        "uname",
        "unlink",
        "unlinkat",
        "utime",
        "utimensat",
        "utimes",
        "vfork",
        "vmsplice",
        "wait4",
        "waitid",
        "waitpid",
        "write",
        "writev"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
EOF

sudo mv /tmp/seccomp-profile.json /etc/cloud-ide-orchestrator/security/seccomp-profile.json
sudo chown $USER:$USER /etc/cloud-ide-orchestrator/security/seccomp-profile.json
sudo chmod 644 /etc/cloud-ide-orchestrator/security/seccomp-profile.json

print_success "Created seccomp security profile"

# Create security monitoring script
print_status "Creating security monitoring script..."

cat > /tmp/security-monitor.sh << 'EOF'
#!/bin/bash

# Cloud IDE Orchestrator Security Monitor
# This script monitors container security and logs violations

LOG_DIR="/var/log/cloud-ide-orchestrator/security"
SECURITY_LOG="$LOG_DIR/security-monitor.log"
ALERT_LOG="$LOG_DIR/security-alerts.log"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SECURITY-MONITOR] $1" >> "$SECURITY_LOG"
}

log_alert() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SECURITY-ALERT] $1" >> "$ALERT_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SECURITY-ALERT] $1" >> "$SECURITY_LOG"
}

# Monitor container resource usage
monitor_resources() {
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" | \
    grep -E "cloud-ide|ide_user" | while read line; do
        container_id=$(echo "$line" | awk '{print $1}')
        cpu_usage=$(echo "$line" | awk '{print $2}' | sed 's/%//')
        memory_usage=$(echo "$line" | awk '{print $3}' | cut -d'/' -f1)
        
        # Alert on high resource usage
        if (( $(echo "$cpu_usage > 90" | bc -l) )); then
            log_alert "High CPU usage detected: Container $container_id using $cpu_usage% CPU"
        fi
        
        # Convert memory to MB for comparison
        if [[ $memory_usage == *"GiB"* ]]; then
            mem_value=$(echo "$memory_usage" | sed 's/GiB//' | awk '{print $1 * 1024}')
        elif [[ $memory_usage == *"MiB"* ]]; then
            mem_value=$(echo "$memory_usage" | sed 's/MiB//')
        else
            mem_value=0
        fi
        
        if (( $(echo "$mem_value > 1800" | bc -l) )); then
            log_alert "High memory usage detected: Container $container_id using $memory_usage"
        fi
    done
}

# Monitor for suspicious container activities
monitor_containers() {
    # Check for containers running with dangerous flags
    docker ps --format "table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.Labels}}" | \
    grep -E "cloud-ide|ide_user" | while read line; do
        container_id=$(echo "$line" | awk '{print $1}')
        
        # Check container configuration for security violations
        docker inspect "$container_id" | jq -r '.[0] | {
            "Privileged": .HostConfig.Privileged,
            "PidMode": .HostConfig.PidMode,
            "UsernsMode": .HostConfig.UsernsMode,
            "CapAdd": .HostConfig.CapAdd,
            "SecurityOpt": .HostConfig.SecurityOpt
        }' | while read config; do
            if echo "$config" | grep -q '"Privileged": true'; then
                log_alert "CRITICAL: Container $container_id running in privileged mode"
            fi
            
            if echo "$config" | grep -q '"PidMode": "host"'; then
                log_alert "CRITICAL: Container $container_id using host PID namespace"
            fi
        done
    done
}

# Monitor network connections
monitor_network() {
    # Check for containers with suspicious network activity
    docker ps --format "{{.ID}}" | grep -E "cloud-ide|ide_user" | while read container_id; do
        # Check for external network connections (should be blocked in isolated mode)
        docker exec "$container_id" netstat -tn 2>/dev/null | grep ESTABLISHED | \
        grep -v "127.0.0.1\|172.20.\|172.19." | while read connection; do
            log_alert "Suspicious external network connection from container $container_id: $connection"
        done
    done
}

# Main monitoring loop
main() {
    log_message "Security monitor started"
    
    while true; do
        monitor_resources
        monitor_containers
        monitor_network
        
        # Sleep for 30 seconds before next check
        sleep 30
    done
}

# Handle signals
trap 'log_message "Security monitor stopped"; exit 0' SIGTERM SIGINT

# Start monitoring
main
EOF

sudo mv /tmp/security-monitor.sh /usr/local/bin/cloud-ide-security-monitor
sudo chmod +x /usr/local/bin/cloud-ide-security-monitor
sudo chown $USER:$USER /usr/local/bin/cloud-ide-security-monitor

print_success "Created security monitoring script"

# Create systemd service for security monitoring (optional)
if command -v systemctl >/dev/null 2>&1; then
    print_status "Creating systemd service for security monitoring..."
    
    cat > /tmp/cloud-ide-security.service << EOF
[Unit]
Description=Cloud IDE Orchestrator Security Monitor
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=/var/lib/cloud-ide-orchestrator
ExecStart=/usr/local/bin/cloud-ide-security-monitor
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloud-ide-security

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/cloud-ide-security.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    print_success "Created systemd service (not enabled by default)"
    print_warning "To enable the security monitor service, run: sudo systemctl enable cloud-ide-security"
fi

# Set up log rotation for security logs
print_status "Setting up log rotation for security logs..."

cat > /tmp/cloud-ide-security << EOF
/var/log/cloud-ide-orchestrator/security/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        # Send signal to application to reopen log files if needed
        /bin/kill -USR1 \$(cat /var/run/cloud-ide-orchestrator.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
EOF

sudo mv /tmp/cloud-ide-security /etc/logrotate.d/
sudo chown root:root /etc/logrotate.d/cloud-ide-security
sudo chmod 644 /etc/logrotate.d/cloud-ide-security

print_success "Set up log rotation for security logs"

# Verify network setup
print_status "Verifying network setup..."

if docker network inspect cloud-ide-isolated >/dev/null 2>&1; then
    print_success "Isolated network is properly configured"
else
    print_error "Failed to create isolated network"
    exit 1
fi

if docker network inspect cloud-ide-network >/dev/null 2>&1; then
    print_success "Main network is properly configured"
else
    print_error "Failed to create main network"
    exit 1
fi

# Create test container to verify security setup
print_status "Testing security configuration with a test container..."

# Pull a minimal test image
docker pull alpine:latest >/dev/null 2>&1

# Test isolated network
TEST_CONTAINER=$(docker run -d --rm \
    --network cloud-ide-isolated \
    --security-opt no-new-privileges:true \
    --security-opt apparmor:docker-default \
    --cap-drop ALL \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=100m \
    alpine:latest sleep 30)

if [ $? -eq 0 ]; then
    print_success "Test container started successfully with security restrictions"
    
    # Test network isolation (should fail to reach external network)
    if docker exec $TEST_CONTAINER ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        print_warning "Network isolation may not be working properly"
    else
        print_success "Network isolation is working correctly"
    fi
    
    # Clean up test container
    docker stop $TEST_CONTAINER >/dev/null 2>&1
else
    print_error "Failed to start test container with security restrictions"
    exit 1
fi

print_success "Security setup completed successfully!"

echo ""
echo "🔒 Security Infrastructure Summary:"
echo "  ✅ Isolated Docker network: cloud-ide-isolated (172.20.0.0/16)"
echo "  ✅ Main Docker network: cloud-ide-network (172.19.0.0/16)"
echo "  ✅ Security directories: /var/log/cloud-ide-orchestrator/security"
echo "  ✅ Security configuration: /etc/cloud-ide-orchestrator/security/config.json"
echo "  ✅ Seccomp profile: /etc/cloud-ide-orchestrator/security/seccomp-profile.json"
if command -v aa-status >/dev/null 2>&1; then
echo "  ✅ AppArmor profile: /etc/apparmor.d/cloud-ide-container"
fi
echo "  ✅ Log rotation configured"
echo ""
echo "🚀 Next steps:"
echo "  1. Update your application configuration to use the security profiles"
echo "  2. Test container creation with the new security settings"
echo "  3. Monitor security logs in /var/log/cloud-ide-orchestrator/security/"
echo "  4. Consider enabling the systemd security monitor service"
echo ""
echo "⚠️  Important security notes:"
echo "  - Containers will run in isolated network mode by default"
echo "  - File system access is restricted to allowed paths only"
echo "  - Terminal commands are filtered through security policies"
echo "  - Resource usage is monitored and limited"
echo "  - All security events are logged for audit purposes"
echo ""