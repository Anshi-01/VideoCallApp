let localStream;
let remoteStream;
let peerConnection;
let isCallActive = false;
let isVideoEnabled = true;
let isAudioEnabled = true;

// Get DOM elements
const startVideoButton = document.getElementById('startVideoButton');
const endCallButton = document.getElementById('endCallButton');
const toggleVideoButton = document.getElementById('toggleVideoButton');
const toggleMicButton = document.getElementById('toggleMicButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const videoContainer = document.getElementById('videoContainer');
const callNotification = document.getElementById('callNotification');
const acceptCallButton = document.getElementById('acceptCallButton');
const rejectCallButton = document.getElementById('rejectCallButton');
const callerNameSpan = document.getElementById('callerName');

const constraints = {
    audio: true,
    video: {
        width: { min: 640, ideal: 1280 },
        height: { min: 480, ideal: 720 },
        facingMode: "user"
    }
};


// Function to handle starting video
async function startVideo() {
    try {
        // First, check if we have permissions
        const permissions = await navigator.mediaDevices.getUserMedia(constraints);
        permissions.getTracks().forEach(track => track.stop()); // Stop the test stream

        // Now actually get the stream for use
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        document.getElementById('localVideo').srcObject = localStream;
        
        // Show video container
        document.getElementById('videoContainer').classList.remove('hidden');
        
        return true;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Unable to access camera/microphone. Please ensure you have granted the necessary permissions and are using HTTPS.');
        return false;
    }
}

// Toggle local video
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoEnabled = videoTrack.enabled;
            
            // Update button UI
            toggleVideoButton.innerHTML = isVideoEnabled ? 
                '<i class="fas fa-video"></i>' : 
                '<i class="fas fa-video-slash"></i>';
            toggleVideoButton.classList.toggle('bg-red-500', !isVideoEnabled);
            
            // Update local video preview
            localVideo.style.opacity = isVideoEnabled ? '1' : '0.3';
        }
    }
}

// Toggle local audio
function toggleMic() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isAudioEnabled = audioTrack.enabled;
            
            // Update button UI
            toggleMicButton.innerHTML = isAudioEnabled ? 
                '<i class="fas fa-microphone"></i>' : 
                '<i class="fas fa-microphone-slash"></i>';
            toggleMicButton.classList.toggle('bg-red-500', !isAudioEnabled);
        }
    }
}

async function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        console.log('Received remote stream');
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteStream = event.streams[0];
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("iceCandidate", { candidate: event.candidate });
        }
    };

    // Log connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
    };

    return peerConnection;
}

async function initiateCall() {
    try {
        console.log('Starting call...');
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        
        // Show video container
        videoContainer.classList.remove('hidden');
        startVideoButton.classList.add('hidden');
        
        // Notify other user about incoming call
        socket.emit("initiateCall", { caller: currentUsername });
        
    } catch (error) {
        console.error('Error starting call:', error);
        alert('Could not access camera or microphone');
        endCall();
    }
}

// Handle incoming video offer
socket.on("videoOffer", async ({ sdp }) => {
    try {
        console.log('Received video offer');
        
        // Create peer connection if not exists
        if (!peerConnection) {
            await createPeerConnection();
        }
        
        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        
        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit("videoAnswer", { sdp: answer });
        
    } catch (error) {
        console.error('Error handling video offer:', error);
        endCall();
    }
});

// Handle video answer
socket.on("videoAnswer", async ({ sdp }) => {
    try {
        console.log('Received video answer');
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log('Remote description set successfully');
        }
    } catch (error) {
        console.error('Error handling video answer:', error);
        endCall();
    }
});

// Handle ICE candidate
socket.on("iceCandidate", async ({ candidate }) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
});

function endCall() {
    // Immediately stop all tracks in both streams
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        remoteStream = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clear video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Reset UI
    videoContainer.classList.add('hidden');
    startVideoButton.classList.remove('hidden');
    
    // Reset controls
    isVideoEnabled = true;
    isAudioEnabled = true;
    toggleVideoButton.innerHTML = '<i class="fas fa-video"></i>';
    toggleMicButton.innerHTML = '<i class="fas fa-microphone"></i>';
    toggleVideoButton.classList.remove('bg-red-500');
    toggleMicButton.classList.remove('bg-red-500');
    
    // Notify server
    socket.emit("endCall");
}

// Event listeners
startVideoButton.addEventListener('click', async () => {
    const success = await startVideo();
    if (success) {
        socket.emit('initiateCall', { caller: currentUsername });
    }
});
endCallButton.addEventListener('click', endCall);
toggleVideoButton.addEventListener('click', toggleVideo);
toggleMicButton.addEventListener('click', toggleMic);

// Handle peer disconnection
socket.on("userDisconnected", () => {
    endCall();
});

socket.on("callEnded", () => {
    endCall();
});

async function acceptCall() {
    try {
        // Get local stream for the person accepting the call
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        
        // Show video container and hide notification
        callNotification.classList.add('hidden');
        videoContainer.classList.remove('hidden');
        startVideoButton.classList.add('hidden');

        // Create peer connection for the person accepting
        const pc = await createPeerConnection();
        socket.emit("callAccepted");
    } catch (error) {
        console.error('Error accepting call:', error);
        alert('Could not access camera or microphone');
        endCall();
    }
}

function rejectCall() {
    callNotification.classList.add('hidden');
    socket.emit("callRejected");
}

socket.on("incomingCall", (data) => {
    callerNameSpan.textContent = data.caller;
    callNotification.classList.remove('hidden');
});

socket.on("callAccepted", async () => {
    try {
        const pc = await createPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("videoOffer", { sdp: offer });
    } catch (error) {
        console.error('Error after call accepted:', error);
        endCall();
    }
});

socket.on("callRejected", () => {
    alert('Call was rejected');
    endCall();
});

acceptCallButton.addEventListener('click', acceptCall);
rejectCallButton.addEventListener('click', rejectCall);

// Make sure all event listeners are properly set up
document.addEventListener('DOMContentLoaded', () => {
    // Event Listeners
    startVideoButton.addEventListener('click', async () => {
        const success = await startVideo();
        if (success) {
            socket.emit('initiateCall', { caller: currentUsername });
        }
    });
    endCallButton.addEventListener('click', endCall);
    toggleVideoButton.addEventListener('click', toggleVideo);
    toggleMicButton.addEventListener('click', toggleMic);
    acceptCallButton.addEventListener('click', acceptCall);
    rejectCallButton.addEventListener('click', rejectCall);
});

// Add mobile-specific handlers for orientation changes
window.addEventListener('orientationchange', () => {
    // Give the browser time to update
    setTimeout(() => {
        const videoContainer = document.getElementById('videoContainer');
        if (!videoContainer.classList.contains('hidden')) {
            // Adjust video sizing/positioning
            const localVideo = document.getElementById('localVideo');
            const remoteVideo = document.getElementById('remoteVideo');
            
            // Force a resize/reposition
            localVideo.style.height = window.innerHeight * 0.2 + 'px';
            remoteVideo.style.height = window.innerHeight + 'px';
        }
    }, 100);
});
