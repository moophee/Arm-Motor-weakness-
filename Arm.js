import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors } from '@mediapipe/drawing_utils';
import './ArmStrengthTest.css';

const ArmStrengthTest = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null);
  const progressCircleRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [isInPosition, setIsInPosition] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [showPopup, setShowPopup] = useState(true);
  const [testCompleted, setTestCompleted] = useState(false);
  const [progress, setProgress] = useState(0);

  const targetArmAngle = 45;
  const angleTolerance = 10;
  let countdownTimer = useRef(null);

  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    pose.onResults((results) => {
      if (isReady && testStarted) processResults(results);
    });

    poseRef.current = pose;
    setIsReady(true);

    return () => {
      if (poseRef.current) poseRef.current.close();
      clearInterval(countdownTimer.current);
    };
  }, [isReady, testStarted]);

  useEffect(() => {
    if (webcamRef.current && isReady && testStarted) {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          await poseRef.current.send({ image: webcamRef.current.video });
        },
        width: 640,
        height: 480,
      });
      camera.start();
    }
  }, [isReady, testStarted]);

  useEffect(() => {
    if (isInPosition && testStarted && countdown > 0) {
      countdownTimer.current = setInterval(() => {
        setCountdown(prev => {
          const newCount = prev - 1;
          const newProgress = ((15 - newCount) / 15) * 100;
          setProgress(newProgress);
          
          if (prev <= 1) {
            clearInterval(countdownTimer.current);
            setTestCompleted(true);
            setTestStarted(false);
            return 0;
          }
          return newCount;
        });
      }, 1000);
    } else {
      clearInterval(countdownTimer.current);
    }

    return () => clearInterval(countdownTimer.current);
  }, [isInPosition, testStarted, countdown]);

  const calculateAngle = (A, B, C) => {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const isWristAboveShoulder = (shoulder, wrist, canvasHeight) => {
    return wrist.y * canvasHeight < shoulder.y * canvasHeight;
  };

  const processResults = (results) => {
    const canvasElement = canvasRef.current;
    const canvasCtx = canvasElement.getContext('2d');

    if (!webcamRef.current?.video) return;

    canvasElement.width = webcamRef.current.video.videoWidth;
    canvasElement.height = webcamRef.current.video.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Mirror the drawing context
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);

    const landmarks = results.poseLandmarks;
    if (!landmarks) return;

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    let allInPosition = false;

    ['left', 'right'].forEach((side) => {
      const shoulder = side === 'right' ? rightShoulder : leftShoulder;
      const wrist = side === 'right' ? rightWrist : leftWrist;

      if (shoulder && wrist) {
        const shoulderPoint = { 
          x: shoulder.x * canvasElement.width, 
          y: shoulder.y * canvasElement.height 
        };
        const wristPoint = { 
          x: wrist.x * canvasElement.width, 
          y: wrist.y * canvasElement.height 
        };

        // Draw shoulder line (mirrored)
        canvasCtx.strokeStyle = 'rgba(255, 235, 59, 0.8)';
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();
        canvasCtx.moveTo(leftShoulder.x * canvasElement.width, leftShoulder.y * canvasElement.height);
        canvasCtx.lineTo(rightShoulder.x * canvasElement.width, rightShoulder.y * canvasElement.height);
        canvasCtx.stroke();

        if (isWristAboveShoulder(shoulder, wrist, canvasElement.height)) {
          const armAngle = calculateAngle(
            shoulderPoint,
            wristPoint,
            { x: wristPoint.x, y: shoulderPoint.y }
          );
          
          allInPosition = Math.abs(armAngle - targetArmAngle) < angleTolerance;

          canvasCtx.strokeStyle = allInPosition ? 'rgba(76, 175, 80, 0.8)' : 'rgba(255, 82, 82, 0.8)';
          canvasCtx.lineWidth = 4;
          canvasCtx.beginPath();
          canvasCtx.moveTo(shoulderPoint.x, shoulderPoint.y);
          canvasCtx.lineTo(wristPoint.x, wristPoint.y);
          canvasCtx.stroke();

          // Draw angle indicator (position adjusted for mirroring)
          canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          canvasCtx.font = 'bold 16px Arial';
          canvasCtx.fillText(`${Math.round(armAngle)}°`, wristPoint.x - 40, wristPoint.y - 10);
          
          // Draw target angle indicator
          if (!allInPosition) {
            canvasCtx.fillStyle = 'rgba(255, 82, 82, 0.8)';
            canvasCtx.fillText(`Target: ${targetArmAngle}°`, wristPoint.x - 40, wristPoint.y + 20);
          }
        }
      }
    });

    setIsInPosition(allInPosition);
    drawConnectors(canvasCtx, landmarks, Pose.POSE_CONNECTIONS, {
      color: '#FFFFFF80',
      lineWidth: 1,
    });
    canvasCtx.restore();
  };

  const startTest = () => {
    setShowPopup(false);
    setTestStarted(true);
    setCountdown(15);
    setTestCompleted(false);
    setProgress(0);
  };

  const resetTest = () => {
    setTestStarted(false);
    setCountdown(15);
    setTestCompleted(false);
    setShowPopup(true);
    setProgress(0);
  };

  return (
    <div className="arm-test-container">
      <div className="header">
        <h1>Arm Strength Test</h1>
        <p className="subtitle">Hold your arm at 45° above shoulder level for 15 seconds</p>
      </div>

      {showPopup && (
        <div className="instruction-popup">
          <div className="popup-content">
            <h2>Test Instructions</h2>
            <div className="instruction-steps">
              <div className="step">
                <div className="step-icon">1</div>
                <p>Stand facing the camera</p>
              </div>
              <div className="step">
                <div className="step-icon">2</div>
                <p>Raise your arm to 45° above shoulder level</p>
              </div>
              <div className="step">
                <div className="step-icon">3</div>
                <p>Hold the position for 15 seconds</p>
              </div>
            </div>
            <button className="start-button" onClick={startTest}>
              Start Test
            </button>
          </div>
        </div>
      )}

      <div className="camera-container">
        <Webcam 
          ref={webcamRef} 
          className="webcam-feed mirrored" 
          screenshotFormat="image/jpeg"
        />
        <canvas ref={canvasRef} className="overlay-canvas" />
      </div>

      {testStarted && (
        <div className="test-status">
          <div className="progress-container">
            <svg className="progress-circle" viewBox="0 0 36 36">
              <path
                className="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                ref={progressCircleRef}
                className="circle-fill"
                strokeDasharray={`${progress}, 100`}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="countdown-text">{countdown}s</div>
          </div>
          
          {isInPosition ? (
            <p className="status-message success">
              <span className="pulse-icon">✓</span> Great! Hold this position
            </p>
          ) : (
            <p className="status-message warning">
              <span>!</span> Adjust your arm to 45° above shoulder
            </p>
          )}
        </div>
      )}

      {testCompleted && (
        <div className="completion-overlay">
          <div className="completion-card">
            <div className="success-animation">
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
              </svg>
            </div>
            <h2>Test Completed!</h2>
            <p>You successfully held the position for 15 seconds</p>
            <button className="retry-button" onClick={resetTest}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArmStrengthTest;
