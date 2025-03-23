// Настройка Paper.js
paper.install(window);
window.onload = function() {
    // Инициализация Paper.js
    paper.setup('bikeCanvas');

    // Создаем группу для рисования
    const frameGroup = new paper.Group();

    // Константы для размеров в миллиметрах
    const GROUND_WIDTH_MM = 1000; // Ширина земли в мм
    const MARGIN_PERCENT = 0.1; // 10% отступ от краев

    // Словарь размеров колес (ISO/ETRTO диаметры ободов в мм)
    const WHEEL_SIZES = {
        '12': 203,
        '16': 305,
        '20': 406,
        '24': 507,
        '26': 559,
        '27.5': 584,
        '29': 622
    };

    // Функция для преобразования миллиметров в пиксели с учетом масштаба
    function mmToPixels(mm, scale) {
        return mm * scale;
    }

    // Функция для расчета масштаба
    function calculateScale(containerWidth, containerHeight, drawingWidthMm, drawingHeightMm) {
        // Учитываем отступы
        const availableWidth = containerWidth * (1 - MARGIN_PERCENT * 2);
        const availableHeight = containerHeight * (1 - MARGIN_PERCENT * 2);
        
        // Рассчитываем масштабы по ширине и высоте
        const scaleX = availableWidth / drawingWidthMm;
        const scaleY = availableHeight / drawingHeightMm;
        
        // Возвращаем минимальный масштаб (чтобы поместилось по обоим измерениям)
        // Добавляем небольшой коэффициент 0.6 для гарантированного помещения
        return Math.min(scaleX, scaleY) * 0.6;
    }

    // Функция для отрисовки колеса
    function drawWheel(center, rimDiameter, tireWidth, scale) {
        // Группа для колеса
        const wheelGroup = new paper.Group();

        // Диаметр с учетом покрышки
        const wheelDiameter = rimDiameter + (tireWidth * 2);
        
        // Радиусы в пикселях
        const rimRadius = mmToPixels(rimDiameter / 2, scale);
        const wheelRadius = mmToPixels(wheelDiameter / 2, scale);

        // Покрышка
        const tire = new paper.Path.Circle(center, wheelRadius);
        tire.strokeColor = '#666';
        tire.strokeWidth = 1;
        wheelGroup.addChild(tire);

        // Обод
        const rim = new paper.Path.Circle(center, rimRadius);
        rim.strokeColor = 'black';
        rim.strokeWidth = 1;
        wheelGroup.addChild(rim);

        // Втулка
        const hub = new paper.Path.Circle(center, 4);
        hub.fillColor = 'black';
        wheelGroup.addChild(hub);

        return wheelGroup;
    }

    // Функция для отрисовки рамы
    function drawFrame() {
        // Очищаем предыдущие рисунки
        frameGroup.removeChildren();

        // Получаем значения из инпутов
        const bbHeight = parseFloat(document.getElementById('bbHeight').value);
        const bbDrop = parseFloat(document.getElementById('bbDrop').value);
        const stack = parseFloat(document.getElementById('stack').value);
        const reach = parseFloat(document.getElementById('reach').value);
        const headTubeLength = parseFloat(document.getElementById('headTubeLength').value);
        const headTubeAngle = parseFloat(document.getElementById('headTubeAngle').value);
        const forkLength = parseFloat(document.getElementById('forkLength').value);
        const seatTubeLength = parseFloat(document.getElementById('seatTubeLength').value);
        const seatTubeAngle = parseFloat(document.getElementById('seatTubeAngle').value);
        const rearWheelSize = document.getElementById('rearWheelSize').value;
        const rearTireWidth = parseFloat(document.getElementById('rearTireWidth').value);
        const frontWheelSize = document.getElementById('frontWheelSize').value;
        const frontTireWidth = parseFloat(document.getElementById('frontTireWidth').value);
        const chainstayLength = parseFloat(document.getElementById('chainstayLength').value);

        // Получаем диаметры ободов в мм
        const rearRimDiameter = WHEEL_SIZES[rearWheelSize];
        const frontRimDiameter = WHEEL_SIZES[frontWheelSize];

        // Диаметры колес с учетом покрышек
        const rearWheelDiameter = rearRimDiameter + (rearTireWidth * 2);
        const frontWheelDiameter = frontRimDiameter + (frontTireWidth * 2);
        const rearWheelRadius = rearWheelDiameter / 2;
        const frontWheelRadius = frontWheelDiameter / 2;

        // Рассчитываем общую ширину и высоту схемы
        const totalWidth = Math.max(
            chainstayLength + // От задней оси до каретки
            reach + // От каретки до верха рулевой трубы
            Math.cos(headTubeAngle * Math.PI / 180) * forkLength + // Горизонтальная проекция вилки
            100 // Добавляем отступ для колес
        );

        const totalHeight = Math.max(
            stack + 50, // Высота до верха рулевой трубы + отступ
            bbHeight + 50, // Высота каретки + отступ
            frontWheelDiameter + 50, // Диаметр переднего колеса + отступ
            rearWheelDiameter + 50 // Диаметр заднего колеса + отступ
        );

        // Определяем размеры контейнера
        const containerWidth = view.size.width;
        const containerHeight = view.size.height;

        // Рассчитываем масштаб с учетом отступов
        const scale = calculateScale(containerWidth, containerHeight, totalWidth, totalHeight);

        // Рассчитываем смещение для центрирования
        const offsetX = (containerWidth - mmToPixels(totalWidth, scale)) / 2;
        const offsetY = containerHeight * (1 - MARGIN_PERCENT);

        // Рисуем линию земли
        const ground = new paper.Path.Line(
            new paper.Point(offsetX - mmToPixels(100, scale), offsetY),
            new paper.Point(offsetX + mmToPixels(totalWidth + 100, scale), offsetY)
        );
        ground.strokeColor = 'black';
        ground.strokeWidth = 2;
        frameGroup.addChild(ground);

        // Рисуем точку каретки
        const bbPoint = new paper.Point(
            offsetX + mmToPixels(chainstayLength, scale),
            offsetY - mmToPixels(bbHeight, scale)
        );
        const bb = new paper.Path.Circle(bbPoint, 5);
        bb.fillColor = 'red';
        frameGroup.addChild(bb);

        // Рисуем верхнюю точку рулевой трубы (head tube top)
        const headTubeTop = new paper.Point(
            bbPoint.x + mmToPixels(reach, scale),
            bbPoint.y - mmToPixels(stack, scale)
        );
        const htTop = new paper.Path.Circle(headTubeTop, 5);
        htTop.fillColor = 'blue';
        frameGroup.addChild(htTop);

        // Рассчитываем нижнюю точку рулевой трубы
        const headTubeAngleRad = (90 - headTubeAngle) * Math.PI / 180; // Преобразуем угол для правильного расчета
        const headTubeBottomX = headTubeTop.x + Math.sin(headTubeAngleRad) * mmToPixels(headTubeLength, scale);
        const headTubeBottomY = headTubeTop.y + Math.cos(headTubeAngleRad) * mmToPixels(headTubeLength, scale);
        const headTubeBottom = new paper.Point(headTubeBottomX, headTubeBottomY);

        // Рисуем рулевую трубу
        const headTube = new paper.Path.Line(headTubeTop, headTubeBottom);
        headTube.strokeColor = 'black';
        headTube.strokeWidth = 2;
        frameGroup.addChild(headTube);

        // Добавляем точку в конце рулевой трубы
        const htBottom = new paper.Path.Circle(headTubeBottom, 5);
        htBottom.fillColor = 'blue';
        frameGroup.addChild(htBottom);

        // Рассчитываем положение оси переднего колеса
        const frontAxleX = headTubeBottom.x + Math.sin(headTubeAngleRad) * mmToPixels(forkLength, scale);
        const frontAxleY = headTubeBottom.y + Math.cos(headTubeAngleRad) * mmToPixels(forkLength, scale);
        const frontAxle = new paper.Point(frontAxleX, frontAxleY);

        // Рассчитываем фактический угол рулевой трубы
        const deltaX = headTubeTop.x - headTubeBottom.x;
        const deltaY = headTubeTop.y - headTubeBottom.y;
        const actualHeadTubeAngle = 90 - Math.atan2(deltaY, deltaX) * 180 / Math.PI;

        // Рисуем вилку как линию от нижней точки рулевой трубы до оси переднего колеса
        const fork = new paper.Path.Line(headTubeBottom, frontAxle);
        fork.strokeColor = 'black';
        fork.strokeWidth = 2;
        frameGroup.addChild(fork);

        // Переднее колесо теперь центрируется на точке frontAxle
        const frontWheelCenter = frontAxle;

        // Рисуем заднее колесо
        const rearWheelCenter = new paper.Point(
            offsetX,
            offsetY - mmToPixels(rearWheelRadius, scale)
        );
        const rearWheel = drawWheel(rearWheelCenter, rearRimDiameter, rearTireWidth, scale);
        frameGroup.addChild(rearWheel);

        // Рисуем переднее колесо
        const frontWheel = drawWheel(frontWheelCenter, frontRimDiameter, frontTireWidth, scale);
        frameGroup.addChild(frontWheel);

        // Рисуем нижние перья (chainstay)
        const chainstay = new paper.Path.Line(bbPoint, rearWheelCenter);
        chainstay.strokeColor = 'black';
        chainstay.strokeWidth = 2;
        frameGroup.addChild(chainstay);

        // Рисуем линию между осями колес
        const axleLine = new paper.Path.Line(rearWheelCenter, frontWheelCenter);
        axleLine.strokeColor = 'purple';
        axleLine.strokeWidth = 1;
        axleLine.dashArray = [4, 4];
        frameGroup.addChild(axleLine);

        // Находим точку на линии осей прямо над кареткой
        const bbProjection = new paper.Point(
            bbPoint.x,
            rearWheelCenter.y + (frontWheelCenter.y - rearWheelCenter.y) * 
            (bbPoint.x - rearWheelCenter.x) / (frontWheelCenter.x - rearWheelCenter.x)
        );

        // Рисуем вертикальную линию BB Drop
        const bbDropLine = new paper.Path.Line(bbProjection, bbPoint);
        bbDropLine.strokeColor = 'purple';
        bbDropLine.strokeWidth = 1;
        bbDropLine.dashArray = [4, 4];
        frameGroup.addChild(bbDropLine);

        // Добавляем размер BB Drop
        const bbDropText = new paper.PointText({
            point: new paper.Point(
                bbPoint.x + 10,
                (bbPoint.y + bbProjection.y) / 2
            ),
            content: Math.round(bbDrop) + ' мм',
            fillColor: 'purple',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(bbDropText);

        // Добавляем маленькие горизонтальные засечки
        const tickLength = 5;
        
        // Засечка у каретки
        const bbTick = new paper.Path.Line(
            new paper.Point(bbPoint.x, bbPoint.y),
            new paper.Point(bbPoint.x + tickLength, bbPoint.y)
        );
        bbTick.strokeColor = 'purple';
        bbTick.strokeWidth = 1;
        frameGroup.addChild(bbTick);

        // Засечка на линии осей
        const projTick = new paper.Path.Line(
            new paper.Point(bbProjection.x, bbProjection.y),
            new paper.Point(bbProjection.x + tickLength, bbProjection.y)
        );
        projTick.strokeColor = 'purple';
        projTick.strokeWidth = 1;
        frameGroup.addChild(projTick);

        // Рассчитываем верхнюю точку подседельной трубы
        const seatTubeAngleRad = seatTubeAngle * Math.PI / 180;
        const seatTubeTopX = bbPoint.x - Math.cos(seatTubeAngleRad) * mmToPixels(seatTubeLength, scale);
        const seatTubeTopY = bbPoint.y - Math.sin(seatTubeAngleRad) * mmToPixels(seatTubeLength, scale);
        const seatTubeTop = new paper.Point(seatTubeTopX, seatTubeTopY);

        // Рисуем подседельную трубу
        const seatTube = new paper.Path.Line(bbPoint, seatTubeTop);
        seatTube.strokeColor = 'black';
        seatTube.strokeWidth = 2;
        frameGroup.addChild(seatTube);

        // Добавляем точку в конце подседельной трубы
        const stTop = new paper.Path.Circle(seatTubeTop, 5);
        stTop.fillColor = 'green';
        frameGroup.addChild(stTop);

        // Рисуем верхнюю трубу (top tube)
        const topTube = new paper.Path.Line(seatTubeTop, headTubeTop);
        topTube.strokeColor = 'black';
        topTube.strokeWidth = 2;
        frameGroup.addChild(topTube);

        // Рисуем нижнюю трубу (down tube)
        const downTube = new paper.Path.Line(bbPoint, headTubeBottom);
        downTube.strokeColor = 'black';
        downTube.strokeWidth = 2;
        frameGroup.addChild(downTube);

        // Рисуем верхние перья (seatstay)
        const seatstay = new paper.Path.Line(seatTubeTop, rearWheelCenter);
        seatstay.strokeColor = 'black';
        seatstay.strokeWidth = 2;
        frameGroup.addChild(seatstay);

        // Добавляем вспомогательную вертикальную линию от земли до каретки
        const bbLine = new paper.Path.Line(
            new paper.Point(bbPoint.x, offsetY),
            bbPoint
        );
        bbLine.strokeColor = 'red';
        bbLine.strokeWidth = 1;
        bbLine.dashArray = [4, 4];
        frameGroup.addChild(bbLine);

        // Добавляем вспомогательные линии для stack и reach
        // Вертикальная линия (stack)
        const stackLine = new paper.Path.Line(
            new paper.Point(bbPoint.x + mmToPixels(reach, scale), bbPoint.y),
            headTubeTop
        );
        stackLine.strokeColor = 'blue';
        stackLine.strokeWidth = 1;
        stackLine.dashArray = [4, 4];
        frameGroup.addChild(stackLine);

        // Горизонтальная линия (reach)
        const reachLine = new paper.Path.Line(
            bbPoint,
            new paper.Point(bbPoint.x + mmToPixels(reach, scale), bbPoint.y)
        );
        reachLine.strokeColor = 'blue';
        reachLine.strokeWidth = 1;
        reachLine.dashArray = [4, 4];
        frameGroup.addChild(reachLine);

        // Добавляем размерную линию общей длины велосипеда
        const leftPoint = new paper.Point(
            rearWheelCenter.x - mmToPixels(rearWheelRadius, scale),
            offsetY + mmToPixels(50, scale) // 50мм под землей
        );
        const rightPoint = new paper.Point(
            frontWheelCenter.x + mmToPixels(frontWheelRadius, scale),
            offsetY + mmToPixels(50, scale) // на той же высоте
        );

        // Рисуем размерную линию
        const wheelbaseLine = new paper.Path.Line(leftPoint, rightPoint);
        wheelbaseLine.strokeColor = 'black';
        wheelbaseLine.strokeWidth = 1;
        frameGroup.addChild(wheelbaseLine);

        // Добавляем вертикальные засечки на концах
        const leftTick = new paper.Path.Line(
            new paper.Point(leftPoint.x, leftPoint.y - tickLength),
            new paper.Point(leftPoint.x, leftPoint.y + tickLength)
        );
        leftTick.strokeColor = 'black';
        leftTick.strokeWidth = 1;
        frameGroup.addChild(leftTick);

        const rightTick = new paper.Path.Line(
            new paper.Point(rightPoint.x, rightPoint.y - tickLength),
            new paper.Point(rightPoint.x, rightPoint.y + tickLength)
        );
        rightTick.strokeColor = 'black';
        rightTick.strokeWidth = 1;
        frameGroup.addChild(rightTick);

        // Вычисляем общую длину в миллиметрах
        const totalLengthMm = (rightPoint.x - leftPoint.x) / scale;

        // Добавляем текст с размером
        const lengthText = new paper.PointText({
            point: new paper.Point(
                (leftPoint.x + rightPoint.x) / 2,
                leftPoint.y + 20
            ),
            content: Math.round(totalLengthMm) + ' мм',
            fillColor: 'black',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'center'
        });
        frameGroup.addChild(lengthText);

        // Рисуем вертикальные размерные линии для осей колес
        // Заднее колесо
        const rearAxleLine = new paper.Path.Line(
            new paper.Point(rearWheelCenter.x - mmToPixels(30, scale), offsetY),
            new paper.Point(rearWheelCenter.x - mmToPixels(30, scale), rearWheelCenter.y)
        );
        rearAxleLine.strokeColor = 'green';
        rearAxleLine.strokeWidth = 1;
        rearAxleLine.dashArray = [4, 4];
        frameGroup.addChild(rearAxleLine);

        // Засечки для заднего колеса
        const rearBottomTick = new paper.Path.Line(
            new paper.Point(rearWheelCenter.x - mmToPixels(35, scale), offsetY),
            new paper.Point(rearWheelCenter.x - mmToPixels(25, scale), offsetY)
        );
        rearBottomTick.strokeColor = 'green';
        rearBottomTick.strokeWidth = 1;
        frameGroup.addChild(rearBottomTick);

        const rearTopTick = new paper.Path.Line(
            new paper.Point(rearWheelCenter.x - mmToPixels(35, scale), rearWheelCenter.y),
            new paper.Point(rearWheelCenter.x - mmToPixels(25, scale), rearWheelCenter.y)
        );
        rearTopTick.strokeColor = 'green';
        rearTopTick.strokeWidth = 1;
        frameGroup.addChild(rearTopTick);

        // Текст для заднего колеса
        const rearAxleText = new paper.PointText({
            point: new paper.Point(
                rearWheelCenter.x - mmToPixels(40, scale),
                (offsetY + rearWheelCenter.y) / 2
            ),
            content: Math.round(rearWheelRadius) + ' мм',
            fillColor: 'green',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'right'
        });
        frameGroup.addChild(rearAxleText);

        // Переднее колесо
        const frontAxleLine = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(30, scale), offsetY),
            new paper.Point(frontWheelCenter.x + mmToPixels(30, scale), frontWheelCenter.y)
        );
        frontAxleLine.strokeColor = 'green';
        frontAxleLine.strokeWidth = 1;
        frontAxleLine.dashArray = [4, 4];
        frameGroup.addChild(frontAxleLine);

        // Засечки для переднего колеса
        const frontBottomTick = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(25, scale), offsetY),
            new paper.Point(frontWheelCenter.x + mmToPixels(35, scale), offsetY)
        );
        frontBottomTick.strokeColor = 'green';
        frontBottomTick.strokeWidth = 1;
        frameGroup.addChild(frontBottomTick);

        const frontTopTick = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(25, scale), frontWheelCenter.y),
            new paper.Point(frontWheelCenter.x + mmToPixels(35, scale), frontWheelCenter.y)
        );
        frontTopTick.strokeColor = 'green';
        frontTopTick.strokeWidth = 1;
        frameGroup.addChild(frontTopTick);

        // Текст для переднего колеса
        const frontAxleText = new paper.PointText({
            point: new paper.Point(
                frontWheelCenter.x + mmToPixels(40, scale),
                (offsetY + frontWheelCenter.y) / 2
            ),
            content: Math.round(frontWheelRadius) + ' мм',
            fillColor: 'green',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(frontAxleText);

        // Добавляем текст для Stack и Reach
        const stackText = new paper.PointText({
            point: new paper.Point(
                bbPoint.x + mmToPixels(reach + 10, scale),
                bbPoint.y - mmToPixels(stack / 2, scale)
            ),
            content: Math.round(stack) + ' мм',
            fillColor: 'blue',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(stackText);

        const reachText = new paper.PointText({
            point: new paper.Point(
                bbPoint.x + mmToPixels(reach / 2, scale),
                bbPoint.y + 20
            ),
            content: Math.round(reach) + ' мм',
            fillColor: 'blue',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'center'
        });
        frameGroup.addChild(reachText);

        // Добавляем текст для высоты каретки
        const bbHeightText = new paper.PointText({
            point: new paper.Point(
                bbPoint.x - mmToPixels(20, scale),
                (bbPoint.y + offsetY) / 2
            ),
            content: Math.round(bbHeight) + ' мм',
            fillColor: 'red',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'right'
        });
        frameGroup.addChild(bbHeightText);

        // Добавляем текст для длины перьев
        const chainstayText = new paper.PointText({
            point: new paper.Point(
                (bbPoint.x + rearWheelCenter.x) / 2,
                bbPoint.y + mmToPixels(20, scale)
            ),
            content: Math.round(chainstayLength) + ' мм',
            fillColor: 'black',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'center'
        });
        frameGroup.addChild(chainstayText);

        // Добавляем текст для длины рулевой трубы
        const headTubeText = new paper.PointText({
            point: new paper.Point(
                headTubeTop.x + mmToPixels(20, scale),
                (headTubeTop.y + headTubeBottom.y) / 2
            ),
            content: Math.round(headTubeLength) + ' мм',
            fillColor: 'black',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(headTubeText);

        // Добавляем текст для длины подседельной трубы
        const seatTubeText = new paper.PointText({
            point: new paper.Point(
                (bbPoint.x + seatTubeTop.x) / 2 - mmToPixels(20, scale),
                (bbPoint.y + seatTubeTop.y) / 2
            ),
            content: Math.round(seatTubeLength) + ' мм',
            fillColor: 'black',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'right'
        });
        frameGroup.addChild(seatTubeText);

        // Добавляем текст для длины вилки
        const forkText = new paper.PointText({
            point: new paper.Point(
                (headTubeBottom.x + frontAxle.x) / 2 + mmToPixels(20, scale),
                (headTubeBottom.y + frontAxle.y) / 2
            ),
            content: Math.round(forkLength) + ' мм',
            fillColor: 'black',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(forkText);

        // Добавляем размер от низа переднего колеса до земли
        const frontWheelBottomPoint = new paper.Point(
            frontWheelCenter.x,
            frontWheelCenter.y + mmToPixels(frontWheelRadius, scale)
        );

        // Вертикальная размерная линия
        const frontClearanceLine = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(60, scale), frontWheelBottomPoint.y),
            new paper.Point(frontWheelCenter.x + mmToPixels(60, scale), offsetY)
        );
        frontClearanceLine.strokeColor = 'orange';
        frontClearanceLine.strokeWidth = 1;
        frontClearanceLine.dashArray = [4, 4];
        frameGroup.addChild(frontClearanceLine);

        // Засечки
        const frontClearanceBottomTick = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(55, scale), offsetY),
            new paper.Point(frontWheelCenter.x + mmToPixels(65, scale), offsetY)
        );
        frontClearanceBottomTick.strokeColor = 'orange';
        frontClearanceBottomTick.strokeWidth = 1;
        frameGroup.addChild(frontClearanceBottomTick);

        const frontClearanceTopTick = new paper.Path.Line(
            new paper.Point(frontWheelCenter.x + mmToPixels(55, scale), frontWheelBottomPoint.y),
            new paper.Point(frontWheelCenter.x + mmToPixels(65, scale), frontWheelBottomPoint.y)
        );
        frontClearanceTopTick.strokeColor = 'orange';
        frontClearanceTopTick.strokeWidth = 1;
        frameGroup.addChild(frontClearanceTopTick);

        // Текст с размером
        const frontClearanceHeight = offsetY - frontWheelBottomPoint.y;
        const frontClearanceMm = Math.round(frontClearanceHeight / scale);
        const frontClearanceText = new paper.PointText({
            point: new paper.Point(
                frontWheelCenter.x + mmToPixels(70, scale),
                (offsetY + frontWheelBottomPoint.y) / 2
            ),
            content: frontClearanceMm + ' мм',
            fillColor: 'orange',
            fontSize: 12,
            fontFamily: 'Arial',
            justification: 'left'
        });
        frameGroup.addChild(frontClearanceText);
    }

    // Добавляем слушатели событий для всех инпутов
    document.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', drawFrame);
    });

    // Первоначальная отрисовка
    drawFrame();

    // Обновление при изменении размера окна
    view.onResize = function(event) {
        drawFrame();
    };

    // Функция для обновления угла рулевой трубы на основе длины вилки
    function updateHeadTubeAngle(forkLength) {
        const deltaX = headTubeTop.x - headTubeBottom.x;
        const deltaY = headTubeTop.y - headTubeBottom.y;
        const actualAngle = 90 - Math.atan2(deltaY, deltaX) * 180 / Math.PI;
        document.getElementById('headTubeAngle').value = actualAngle.toFixed(1);
    }

    // Функция для обновления длины вилки на основе угла
    function updateForkLength(headTubeAngle) {
        const angleRad = (90 - headTubeAngle) * Math.PI / 180;
        const deltaY = offsetY - mmToPixels(frontWheelRadius, scale) - headTubeBottom.y;
        const actualLength = deltaY / Math.cos(angleRad);
        document.getElementById('forkLength').value = Math.round(actualLength);
    }

    // Добавляем слушатели событий
    document.getElementById('headTubeAngle').addEventListener('input', function(e) {
        const angle = parseFloat(e.target.value);
        updateForkLength(angle);
        drawFrame();
    });

    document.getElementById('forkLength').addEventListener('input', function(e) {
        const length = parseFloat(e.target.value);
        updateHeadTubeAngle(length);
        drawFrame();
    });
} 