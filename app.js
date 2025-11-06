// 전역 변수
let map;
let directionsService;
let directionsRenderer;
let placesService;
let geocoder;
let currentRoute = null;
let nearbyPlaces = [];
let budgetChartInstance = null;
let comparisonChartInstance = null;
let currentMapProvider = 'google'; // 'google' 또는 'leaflet'
let leafletMap = null;
let leafletRoutingControl = null;
let leafletMarkers = [];

// 앱 데이터
const appData = {
    departure: '',
    destination: '',
    departureDate: '',
    duration: 3,
    budget: 0,
    transportMode: 'DRIVING',
    route: null,
    recommendations: [],
    budgetBreakdown: {
        transport: 30,
        accommodation: 40,
        food: 20,
        activity: 10
    }
};

// ==================== 지도 초기화 ====================

// Google Maps 초기화
function initMap() {
    try {
        console.log('Google Maps 초기화 시작...');

        // 맵 컨테이너 확인
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('지도 컨테이너를 찾을 수 없습니다.');
            return;
        }

        // 맵 초기화 (서울 중심)
        map = new google.maps.Map(mapElement, {
            center: { lat: 37.5665, lng: 126.9780 },
            zoom: 12,
            mapTypeControl: true,
            fullscreenControl: true,
            streetViewControl: false,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'on' }]
                }
            ]
        });

        // 서비스 초기화
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#2563eb',
                strokeWeight: 5,
                strokeOpacity: 0.8
            }
        });
        placesService = new google.maps.places.PlacesService(map);
        geocoder = new google.maps.Geocoder();

        // 이벤트 리스너 설정
        setupEventListeners();

        // 차트 초기화
        initCharts();

        // 로딩 인디케이터 숨기기
        hideMapLoading();

        console.log('✓ Google Maps가 성공적으로 로드되었습니다.');
        showNotification('지도가 준비되었습니다!', 'success');

    } catch (error) {
        console.error('Google Maps 초기화 오류:', error);
        handleMapLoadError();
    }
}

// Leaflet Map 초기화
function initLeafletMap() {
    try {
        console.log('Leaflet 지도 초기화 시작...');

        const mapElement = document.getElementById('map');
        mapElement.innerHTML = ''; // 기존 내용 제거

        // Leaflet 맵 생성 (서울 중심)
        leafletMap = L.map('map').setView([37.5665, 126.9780], 12);

        // OpenStreetMap 타일 레이어 추가
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(leafletMap);

        // 이벤트 리스너 설정 (아직 없다면)
        if (!document.getElementById('search-route').hasListener) {
            setupEventListeners();
        }

        // 차트 초기화 (아직 없다면)
        if (!budgetChartInstance) {
            initCharts();
        }

        console.log('✓ Leaflet 지도가 성공적으로 로드되었습니다.');
        showNotification('OpenStreetMap이 준비되었습니다!', 'success');

    } catch (error) {
        console.error('Leaflet 초기화 오류:', error);
        showNotification('지도 로드에 실패했습니다.', 'error');
    }
}

// 지도 제공자 전환
function switchMapProvider(provider) {
    currentMapProvider = provider;

    // 버튼 활성화 상태 변경
    document.querySelectorAll('.provider-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    if (provider === 'google') {
        document.getElementById('use-google-maps').classList.add('active');
        if (leafletMap) {
            leafletMap.remove();
            leafletMap = null;
        }
        const mapElement = document.getElementById('map');
        mapElement.innerHTML = '<div id="map-loading" class="map-loading"><div class="loader"></div><p>Google Maps를 로드하는 중...</p></div>';

        // Google Maps 초기화
        if (typeof google !== 'undefined') {
            setTimeout(() => initMap(), 100);
        }
    } else {
        document.getElementById('use-openstreetmap').classList.add('active');
        initLeafletMap();
    }
}

// 로딩 인디케이터 숨기기
function hideMapLoading() {
    const loadingElement = document.getElementById('map-loading');
    if (loadingElement) {
        setTimeout(() => {
            loadingElement.style.opacity = '0';
            loadingElement.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                loadingElement.remove();
            }, 500);
        }, 500);
    }
}

// 지도 로드 에러 처리
function handleMapLoadError() {
    const loadingElement = document.getElementById('map-loading');
    if (loadingElement) {
        loadingElement.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
            <p style="color: #ef4444; font-weight: bold;">지도 로드 실패</p>
            <button onclick="switchMapProvider('leaflet')" style="margin-top: 15px; padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer;">
                OpenStreetMap 사용하기
            </button>
        `;
    }
    showNotification('Google Maps 로드 실패. OpenStreetMap을 사용해보세요.', 'error');
}

// Google Maps 콜백을 전역으로 노출
window.initMap = initMap;

// ==================== 이벤트 리스너 ====================

function setupEventListeners() {
    // 탭 전환
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });

    // 경로 검색
    const searchBtn = document.getElementById('search-route');
    searchBtn.addEventListener('click', searchRoute);
    searchBtn.hasListener = true;

    // 지도 제공자 전환
    document.getElementById('use-google-maps').addEventListener('click', () => {
        switchMapProvider('google');
    });

    document.getElementById('use-openstreetmap').addEventListener('click', () => {
        switchMapProvider('leaflet');
    });

    // 예산 슬라이더
    const sliders = ['transport', 'accommodation', 'food', 'activity'];
    sliders.forEach(type => {
        const slider = document.getElementById(`${type}-slider`);
        if (slider) {
            slider.addEventListener('input', () => updateBudgetBreakdown());
        }
    });

    // 추천 필터
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            filterRecommendations(filter);
        });
    });

    // 예산 입력 변경
    document.getElementById('budget').addEventListener('input', updateBudgetBreakdown);
}

// ==================== 탭 전환 ====================

function switchTab(tabId) {
    // 탭 버튼 활성화
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });

    // 탭 콘텐츠 표시
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');

    // Leaflet 지도 크기 조정
    if (tabId === 'planner' && leafletMap) {
        setTimeout(() => leafletMap.invalidateSize(), 100);
    }

    // 요약 탭이면 업데이트
    if (tabId === 'summary') {
        updateSummary();
    }
}

// ==================== 경로 검색 ====================

async function searchRoute() {
    const departure = document.getElementById('departure').value;
    const destination = document.getElementById('destination').value;
    const departureDate = document.getElementById('departure-date').value;
    const duration = parseInt(document.getElementById('duration').value);
    const budget = parseInt(document.getElementById('budget').value);
    const transportMode = document.getElementById('transport-mode').value;

    // 유효성 검사
    if (!departure || !destination) {
        showNotification('출발지와 목적지를 입력해주세요.', 'error');
        return;
    }

    if (!budget || budget <= 0) {
        showNotification('예산을 입력해주세요.', 'error');
        return;
    }

    // 데이터 저장
    appData.departure = departure;
    appData.destination = destination;
    appData.departureDate = departureDate;
    appData.duration = duration;
    appData.budget = budget;
    appData.transportMode = transportMode;

    // 로딩 표시
    const searchBtn = document.getElementById('search-route');
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<span class="loading"></span> 검색 중...';
    searchBtn.disabled = true;

    try {
        if (currentMapProvider === 'google') {
            await searchRouteWithGoogle(departure, destination, transportMode);
        } else {
            await searchRouteWithLeaflet(departure, destination, transportMode);
        }
    } catch (error) {
        console.error('경로 검색 오류:', error);
        showNotification('경로 검색 중 오류가 발생했습니다.', 'error');
    } finally {
        // 버튼 복원
        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;
    }
}

// Google Maps로 경로 검색
function searchRouteWithGoogle(departure, destination, transportMode) {
    return new Promise((resolve, reject) => {
        const request = {
            origin: departure,
            destination: destination,
            travelMode: google.maps.TravelMode[transportMode],
            provideRouteAlternatives: true
        };

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                // 경로 표시
                directionsRenderer.setDirections(result);

                // 경로 정보 저장
                const route = result.routes[0];
                const leg = route.legs[0];
                appData.route = {
                    distance: leg.distance.text,
                    duration: leg.duration.text,
                    distanceValue: leg.distance.value,
                    durationValue: leg.duration.value
                };

                // 경로 정보 표시
                displayRouteInfo(appData.route);

                // 주변 장소 검색
                searchNearbyPlaces(leg.end_location);

                showNotification('경로를 찾았습니다!', 'success');
                resolve();
            } else {
                showNotification('경로를 찾을 수 없습니다. 주소를 확인해주세요.', 'error');
                reject(new Error('Google Maps 경로 검색 실패'));
            }
        });
    });
}

// Leaflet으로 경로 검색
async function searchRouteWithLeaflet(departure, destination, transportMode) {
    try {
        // 기존 경로 제거
        if (leafletRoutingControl) {
            leafletMap.removeControl(leafletRoutingControl);
        }

        // 기존 마커 제거
        leafletMarkers.forEach(marker => leafletMap.removeLayer(marker));
        leafletMarkers = [];

        // Nominatim을 사용하여 주소를 좌표로 변환
        const depCoords = await geocodeAddress(departure);
        const destCoords = await geocodeAddress(destination);

        // 교통 수단 변환
        const routingMode = transportMode === 'WALKING' ? 'pedestrian' :
                          transportMode === 'TRANSIT' ? 'publicTransport' : 'car';

        // 경로 찾기
        leafletRoutingControl = L.Routing.control({
            waypoints: [
                L.latLng(depCoords.lat, depCoords.lon),
                L.latLng(destCoords.lat, destCoords.lon)
            ],
            routeWhileDragging: true,
            lineOptions: {
                styles: [{ color: '#2563eb', weight: 5, opacity: 0.8 }]
            }
        }).addTo(leafletMap);

        // 경로 정보 이벤트
        leafletRoutingControl.on('routesfound', function(e) {
            const route = e.routes[0];
            const distance = (route.summary.totalDistance / 1000).toFixed(1);
            const duration = Math.round(route.summary.totalTime / 60);

            appData.route = {
                distance: `${distance} km`,
                duration: `${duration}분`,
                distanceValue: route.summary.totalDistance,
                durationValue: route.summary.totalTime
            };

            displayRouteInfo(appData.route);

            // 목적지 주변 추천 장소 생성 (OpenStreetMap에서는 제한적)
            generateMockRecommendations(destCoords);
        });

        showNotification('경로를 찾았습니다!', 'success');

    } catch (error) {
        console.error('Leaflet 경로 검색 오류:', error);
        showNotification('경로를 찾을 수 없습니다. 주소를 확인해주세요.', 'error');
        throw error;
    }
}

// Nominatim으로 주소를 좌표로 변환
async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.length === 0) {
        throw new Error('주소를 찾을 수 없습니다');
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

// 모의 추천 장소 생성 (OpenStreetMap 사용 시)
function generateMockRecommendations(destCoords) {
    nearbyPlaces = [
        {
            name: '주변 관광 명소',
            category: 'tourist',
            rating: 4.5,
            address: '목적지 주변',
            location: { lat: destCoords.lat, lng: destCoords.lon },
            photo: null
        },
        {
            name: '추천 맛집',
            category: 'restaurant',
            rating: 4.3,
            address: '목적지 주변',
            location: { lat: destCoords.lat + 0.001, lng: destCoords.lon + 0.001 },
            photo: null
        },
        {
            name: '숙박 시설',
            category: 'accommodation',
            rating: 4.7,
            address: '목적지 주변',
            location: { lat: destCoords.lat - 0.001, lng: destCoords.lon - 0.001 },
            photo: null
        }
    ];

    displayRecommendations();
    appData.recommendations = nearbyPlaces;
}

// ==================== 경로 정보 표시 ====================

function displayRouteInfo(route) {
    document.getElementById('route-info').style.display = 'block';
    document.getElementById('distance').textContent = route.distance;
    document.getElementById('duration-display').textContent = route.duration;

    // 교통비 추정 (간단한 계산)
    let estimatedCost = 0;
    const distanceKm = route.distanceValue / 1000;

    switch (appData.transportMode) {
        case 'DRIVING':
            estimatedCost = Math.round(distanceKm * 150); // km당 150원 (유류비)
            break;
        case 'TRANSIT':
            estimatedCost = Math.round(distanceKm * 100); // km당 100원 (대중교통)
            break;
        case 'WALKING':
            estimatedCost = 0;
            break;
    }

    document.getElementById('estimated-cost').textContent = estimatedCost.toLocaleString() + '원';
}

// ==================== 주변 장소 검색 (Google Maps만) ====================

function searchNearbyPlaces(location) {
    if (currentMapProvider !== 'google') return;

    nearbyPlaces = [];

    const searchTypes = [
        { type: 'tourist_attraction', category: 'tourist' },
        { type: 'restaurant', category: 'restaurant' },
        { type: 'lodging', category: 'accommodation' }
    ];

    let completedSearches = 0;

    searchTypes.forEach(searchType => {
        const request = {
            location: location,
            radius: 5000, // 5km 반경
            type: searchType.type
        };

        placesService.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                results.slice(0, 5).forEach(place => {
                    nearbyPlaces.push({
                        name: place.name,
                        category: searchType.category,
                        rating: place.rating || 0,
                        address: place.vicinity,
                        location: place.geometry.location,
                        photo: place.photos ? place.photos[0].getUrl({ maxWidth: 400 }) : null
                    });
                });
            }

            completedSearches++;
            if (completedSearches === searchTypes.length) {
                displayRecommendations();
            }
        });
    });
}

// ==================== 추천 장소 표시 ====================

function displayRecommendations(filter = 'all') {
    const container = document.getElementById('recommendations-list');
    container.innerHTML = '';

    let filteredPlaces = nearbyPlaces;
    if (filter !== 'all') {
        filteredPlaces = nearbyPlaces.filter(place => place.category === filter);
    }

    if (filteredPlaces.length === 0) {
        container.innerHTML = `
            <div class="recommendation-card">
                <div class="card-image">
                    <i class="fas fa-search"></i>
                </div>
                <div class="card-content">
                    <h3>검색 결과 없음</h3>
                    <p>경로를 검색하면 추천 장소를 제공합니다.</p>
                </div>
            </div>
        `;
        return;
    }

    filteredPlaces.forEach(place => {
        const card = document.createElement('div');
        card.className = 'recommendation-card';

        const categoryIcon = {
            'tourist': 'fa-landmark',
            'restaurant': 'fa-utensils',
            'accommodation': 'fa-hotel'
        };

        const icon = categoryIcon[place.category] || 'fa-map-marker-alt';

        card.innerHTML = `
            <div class="card-image" style="${place.photo ? `background: url('${place.photo}') center/cover;` : ''}">
                ${!place.photo ? `<i class="fas ${icon}"></i>` : ''}
            </div>
            <div class="card-content">
                <h3>${place.name}</h3>
                <p>${place.address}</p>
                <div class="card-rating">
                    <i class="fas fa-star"></i>
                    <span>${place.rating.toFixed(1)}</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            if (currentMapProvider === 'google' && place.location) {
                map.setCenter(place.location);
                map.setZoom(15);
                new google.maps.Marker({
                    position: place.location,
                    map: map,
                    title: place.name,
                    animation: google.maps.Animation.BOUNCE
                });
            } else if (currentMapProvider === 'leaflet' && place.location) {
                leafletMap.setView([place.location.lat, place.location.lng], 15);
                const marker = L.marker([place.location.lat, place.location.lng])
                    .addTo(leafletMap)
                    .bindPopup(place.name);
                leafletMarkers.push(marker);
            }
            setTimeout(() => switchTab('planner'), 100);
        });

        container.appendChild(card);
    });

    appData.recommendations = filteredPlaces;
}

function filterRecommendations(filter) {
    displayRecommendations(filter);
}

// ==================== 예산 관리 ====================

function updateBudgetBreakdown() {
    const budget = parseInt(document.getElementById('budget').value) || 0;

    if (budget === 0) {
        document.getElementById('total-budget').textContent = '0원';
        document.getElementById('estimated-spending').textContent = '0원';
        document.getElementById('remaining-budget').textContent = '0원';
        return;
    }

    appData.budget = budget;

    // 슬라이더 값 가져오기
    const transport = parseInt(document.getElementById('transport-slider').value);
    const accommodation = parseInt(document.getElementById('accommodation-slider').value);
    const food = parseInt(document.getElementById('food-slider').value);
    const activity = parseInt(document.getElementById('activity-slider').value);

    // 총합 계산
    const total = transport + accommodation + food + activity;

    // 비율 계산
    const transportCost = Math.round(budget * (transport / total));
    const accommodationCost = Math.round(budget * (accommodation / total));
    const foodCost = Math.round(budget * (food / total));
    const activityCost = Math.round(budget * (activity / total));

    // 표시
    document.getElementById('transport-cost').textContent = transportCost.toLocaleString() + '원';
    document.getElementById('accommodation-cost').textContent = accommodationCost.toLocaleString() + '원';
    document.getElementById('food-cost').textContent = foodCost.toLocaleString() + '원';
    document.getElementById('activity-cost').textContent = activityCost.toLocaleString() + '원';

    // 예산 카드 업데이트
    const estimatedSpending = transportCost + accommodationCost + foodCost + activityCost;
    document.getElementById('total-budget').textContent = budget.toLocaleString() + '원';
    document.getElementById('estimated-spending').textContent = estimatedSpending.toLocaleString() + '원';
    document.getElementById('remaining-budget').textContent = (budget - estimatedSpending).toLocaleString() + '원';

    // 차트 업데이트
    updateBudgetChart(transportCost, accommodationCost, foodCost, activityCost);

    // 데이터 저장
    appData.budgetBreakdown = {
        transport: transportCost,
        accommodation: accommodationCost,
        food: foodCost,
        activity: activityCost
    };
}

// ==================== 차트 ====================

function initCharts() {
    // 예산 차트
    const budgetCtx = document.getElementById('budget-chart');
    if (budgetCtx) {
        budgetChartInstance = new Chart(budgetCtx, {
            type: 'doughnut',
            data: {
                labels: ['교통비', '숙박비', '식비', '관광/활동'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#2563eb',
                        '#06b6d4',
                        '#10b981',
                        '#f59e0b'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // 비교 차트
    const comparisonCtx = document.getElementById('comparison-chart');
    if (comparisonCtx) {
        comparisonChartInstance = new Chart(comparisonCtx, {
            type: 'bar',
            data: {
                labels: ['현재 경로'],
                datasets: [
                    {
                        label: '거리 (km)',
                        data: [0],
                        backgroundColor: '#2563eb'
                    },
                    {
                        label: '시간 (분)',
                        data: [0],
                        backgroundColor: '#06b6d4'
                    },
                    {
                        label: '비용 (천원)',
                        data: [0],
                        backgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updateBudgetChart(transport, accommodation, food, activity) {
    if (budgetChartInstance) {
        budgetChartInstance.data.datasets[0].data = [transport, accommodation, food, activity];
        budgetChartInstance.update();
    }
}

function updateComparisonChart() {
    if (comparisonChartInstance && appData.route) {
        const distanceKm = Math.round(appData.route.distanceValue / 1000);
        const durationMin = Math.round(appData.route.durationValue / 60);
        const costThousand = Math.round(appData.budgetBreakdown.transport / 1000);

        comparisonChartInstance.data.datasets[0].data = [distanceKm];
        comparisonChartInstance.data.datasets[1].data = [durationMin];
        comparisonChartInstance.data.datasets[2].data = [costThousand];
        comparisonChartInstance.update();
    }
}

// ==================== 일정 요약 ====================

function updateSummary() {
    // 경로 정보
    if (appData.route) {
        document.getElementById('summary-route').innerHTML = `
            <div class="summary-item">
                <span>출발:</span>
                <span>${appData.departure}</span>
            </div>
            <div class="summary-item">
                <span>도착:</span>
                <span>${appData.destination}</span>
            </div>
            <div class="summary-item">
                <span>거리:</span>
                <span>${appData.route.distance}</span>
            </div>
        `;
    }

    // 시간 정보
    document.getElementById('summary-duration').textContent = `${appData.duration}일`;
    if (appData.route) {
        document.getElementById('summary-travel-time').textContent = appData.route.duration;
    }

    // 비용 정보
    document.getElementById('summary-total-budget').textContent = appData.budget.toLocaleString() + '원';
    const totalSpending = Object.values(appData.budgetBreakdown).reduce((a, b) => a + b, 0);
    document.getElementById('summary-estimated').textContent = totalSpending.toLocaleString() + '원';

    // 추천 장소
    if (appData.recommendations.length > 0) {
        let placesHtml = '<ul style="list-style: none; padding: 0;">';
        appData.recommendations.slice(0, 5).forEach(place => {
            placesHtml += `
                <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                    <strong>${place.name}</strong><br>
                    <small style="color: #6b7280;">${place.address}</small>
                </li>
            `;
        });
        placesHtml += '</ul>';
        document.getElementById('summary-places').innerHTML = placesHtml;
    }

    // 비교 차트 업데이트
    updateComparisonChart();
}

// ==================== 알림 ====================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <strong>${type === 'success' ? '✓' : '✗'}</strong> ${message}
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== 페이지 로드 ====================

window.addEventListener('load', () => {
    console.log('TripSync 앱 로딩 완료');

    // 오늘 날짜를 기본값으로 설정
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('departure-date').value = now.toISOString().slice(0, 16);

    // Google Maps가 로드되지 않으면 자동으로 Leaflet으로 전환
    setTimeout(() => {
        if (typeof google === 'undefined' || !map) {
            console.log('Google Maps를 사용할 수 없습니다. Leaflet으로 전환합니다.');
            switchMapProvider('leaflet');
        }
    }, 3000);
});
