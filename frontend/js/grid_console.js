/**
 * ============================================================================
 * АРМ ПОВ-112 ГОРОДА МОСКВЫ — ГЛАВНЫЙ ЭКРАН / СПИСОК ПРОИСШЕСТВИЙ (ГРИД)
 * grid_console.js — Контроллер интерактивного грида происшествий
 * 100% аутентичность по регламентным скриншотам 1-11 из реального ПОВ-112
 * ============================================================================
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Базовый массив происшествий в точном соответствии со скриншотами 1-11
  const INITIAL_INCIDENTS = [
    // ----------------------------------------------------------------------
    // СКРИНШОТ 3: Поиск по адресу "ленинск", округу "ЮАО, ЮЗАО" (media_1789433572525.png)
    // ----------------------------------------------------------------------
    {
      id: '37373120',
      oper: '667',
      arm: '652',
      date: '06.01.25',
      time: '21:52:45',
      type: '101',
      victims: 'Нет',
      status: 'Завершена',
      address: 'Москва , Ленинский проспект , 23 , (ЮАО, Донской район) , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '06.01.2025 21:54:23 Опер. 667 Туповикова Е. А. - постр. не видит,\n06.01.2025 22:00:40 Опер. 290 Демкина С. А. - Контроль-0\n06.01.2025 22:04:20 Опер. 667 Туповикова Е. А. -\n06.01.2025 22:09:25 Опер. 667 Туповикова Е. А. - геолокации Ленинградский проспект заявитель не подтверждает //\n06.01.2025 22:13:51 МЧС - Изменились данные заявителя - имя: "*", телефон: "*"\n06.01.2025 22:13:51 МЧС - Изменение параметра Категория на: Ложное происшествие',
      services: [{ name: 'Служба 101', time: '21:52:45', status: 'Завершена' }]
    },
    {
      id: '37326012',
      oper: '927',
      arm: '622',
      date: '04.01.25',
      time: '13:04:26',
      type: '101',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , Ленинский проспект , 125 , к. 1 , (ЮЗАО, Тёплый Стан)',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '04.01.2025 13:05:12 Опер. 927 Володин М. В. - 03 не треб\n04.01.2025 13:05:48 МЧС - Изменились данные заявителя - имя: "*", телефон: "*"\n04.01.2025 13:05:48 МЧС - Изменение параметра Ранг на: Ранг 1\n04.01.2025 13:08:52 Опер. 393 Хантурина В. Г. - Контроль-1',
      services: [{ name: 'Служба 101', time: '13:04:26', status: 'В работе', class: 'active-react' }]
    },
    {
      id: '37281241',
      oper: '867',
      arm: '623',
      date: '02.01.25',
      time: '00:44:08',
      type: '101, Дополнительный звонок от заявителя',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , Ленинский проспект , 86 , (ЮЗАО, Ломоносовский район) , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '02.01.2025 00:45:47 Опер. 867 Субмаш А. М. - провода искрят\\\\ провода не оборваны\\\\ коротят\n02.01.2025 00:52:00 Опер. 267 Стрельцова И. А. - Контроль-3 Контроль-6 Контроль-4',
      services: [{ name: 'Служба 101', time: '00:44:08', status: 'В работе' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 4: Поиск по описательному адресу "гараж" (media_1789433608293.png)
    // ----------------------------------------------------------------------
    {
      id: '37621363',
      oper: '411',
      arm: '612',
      date: '18.01.25',
      time: '19:19:18',
      type: '101, Взрыв',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , поселок Шишкин Лес , 23 , (ТАО, Михайлово-Ярцевское) , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '18.01.2025 19:23:32 Опер. 411 Гуськова Ю. М. - услышала взрыв / зарево / далее искрятся и горят провода\n18.01.2025 19:24:04 Опер. 411 Гуськова Ю. М. - криков нет / 101 следуют\n18.01.2025 19:30:30 Опер. 356 Руденко М. И. Контроль-3 Контроль-6\n18.01.2025 19:31:34 Опер. 356 Руденко М. И. - Контроль-3 Контроль-Д Контроль-6 Контроль-9 Контроль-4',
      services: [{ name: 'Служба 101', time: '19:19:18', status: 'В пути' }]
    },
    {
      id: '37478276',
      oper: '663',
      arm: '640',
      date: '12.01.25',
      time: '00:07:37',
      type: '101, Дополнительный звонок от заявителя',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , Полтавская улица , 47 , к. 2 , (САО, Савёловский район) , ...',
      descriptiveAddress: 'Россия , Москва , Полтавская улица , 47 , к. 2 , (САО, Савёловский район) , со стороны гаражей во дворе',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '12.01.2025 00:10:51 Опер. 663 Петрова А. С. - что горит не видит // наблюдает с 15 этажа // инфо о пострадавших нет // криков о помощи не слышит\n12.01.2025 00:14:32 Опер. 530 Свиридова Е. Н. - Контроль-3 Контроль-4 Контроль-1',
      services: [{ name: 'Служба 101', time: '00:07:37', status: 'В пути' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 5: Поиск по региону "Свердловская область" (media_1789433674242.png)
    // ----------------------------------------------------------------------
    {
      id: '37844731',
      oper: '833',
      arm: '653',
      date: '29.01.25',
      time: '09:46:14',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Свердловская область , поселок Черноисточинск , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '29.01.2025 09:48:35 Опер. 833 Берегин О. В. -',
      services: [{ name: 'Служба 103', time: '09:46:14', status: 'Принята' }]
    },
    {
      id: '37830224',
      oper: '758',
      arm: '627',
      date: '28.01.25',
      time: '15:46:31',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Свердловская область , Асбест , Асбестовский городской округ',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '28.01.2025 15:49:46 Опер. 758 Ольховская Т. В. -',
      services: [{ name: 'Служба 103', time: '15:46:31', status: 'Принята' }]
    },
    {
      id: '37778922',
      oper: '418',
      arm: '619',
      date: '26.01.25',
      time: '09:47:40',
      type: 'Человек в опасности',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Свердловская область , Екатеринбург , улица',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '26.01.2025 09:51:25 Опер. 418 Ерошкин М. Н. -',
      services: [{ name: 'Служба 112', time: '09:47:40', status: 'Проверена' }]
    },
    {
      id: '37758896',
      oper: '521',
      arm: '631',
      date: '25.01.25',
      time: '11:12:50',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Свердловская область , Екатеринбург , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '25.01.2025 11:15:10 Опер. 521 Семина В. А. - дверь должны открыть / заяв-ль уточнит,если не смогут -перезвонит в 112 /',
      services: [{ name: 'Служба 103', time: '11:12:50', status: 'Принята' }]
    },
    {
      id: '37758854',
      oper: '334',
      arm: '436',
      date: '25.01.25',
      time: '11:10:13',
      type: 'Консультация',
      victims: 'Нет',
      status: 'Завершена',
      address: 'Свердловская область , Екатеринбург , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '25.01.2025 11:12:01 Опер. 334 Малышева Ю. Е. - просит вызвать врача на дом из пол-ки в Екатеринбург//даны разъяснения, рекомендовано вызвать врача непосредственно из Екатеринбурга',
      services: [{ name: 'Служба 112', time: '11:10:13', status: 'Завершена' }]
    },
    {
      id: '37735419',
      oper: '540',
      arm: '454',
      date: '24.01.25',
      time: '08:43:36',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Свердловская область , Екатеринбург , улица Павла Шаманова , 40 , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '24.01.2025 08:44:48 Опер. 540 Ускова Я. С. - отек лица',
      services: [{ name: 'Служба 103', time: '08:43:36', status: 'Принята' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 6: Поиск по службе "ОЭК", типу "101", признакам (media_1789434829510.png)
    // ----------------------------------------------------------------------
    {
      id: '37880730',
      oper: '715',
      arm: '636',
      date: '30.01.25',
      time: '22:59:25',
      type: '101',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , поселок Птичное , Южная улица , 11 , (ТАО, Первомайское) , ...',
      serviceName: 'ОЭК',
      signs: 'Улица, Открытое пламя, мусор',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 23:00:14 Опер. 715 Табацкая А. М. - пострадавших нет/ горит щиток\n30.01.2025 23:01:12 Опер. 715 Табацкая А. М. - щиток на столбе\n30.01.2025 23:21:40 Опер. 247 Илюшенов Г. П. - Контроль-4, Контроль-1, Контроль-9, Контроль-3\n30.01.2025 23:55:34 Опер. 395 Чувинова Е. А. - Контроль-8\n02.02.2025 17:13:39 Опер. 297 Безрученкова Е. Д. - Контроль-у',
      services: [{ name: 'ОЭК', time: '22:59:25', status: 'Принята' }, { name: 'Служба 101', time: '22:59:25', status: 'Отработана' }]
    },
    {
      id: '37880690',
      oper: '529',
      arm: '635',
      date: '30.01.25',
      time: '22:57:20',
      type: '101',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , поселок Птичное , Южная улица , 10 , (ТАО, Первомайское) , ...',
      serviceName: 'ОЭК',
      signs: 'Улица, Открытое пламя, мусор',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 23:00:09 Опер. 529 Свиркина М. В. - 101 от комм отказ\n30.01.2025 23:03:49 Опер. 684 Безрученкова А. Д. - Контроль-9\n30.01.2025 23:38:47 Опер. 684 Безрученкова А. Д. - Контроль-2\n30.01.2025 23:44:16 МЧС - Электрические сети: электрические сети\n31.01.2025 02:12:46 Опер. 395 Чувинова Е. А. - Контроль-8\n02.02.2025 17:11:42 Опер. 297 Безрученкова Е. Д. - Контроль-у',
      services: [{ name: 'ОЭК', time: '22:57:20', status: 'Принята' }, { name: 'Служба 101', time: '22:57:20', status: 'Отработана' }]
    },
    {
      id: '37859019',
      oper: '204',
      arm: '224',
      date: '29.01.25',
      time: '22:30:54',
      type: '101',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , проспект Мира , 108 , (СВАО, Алексеевский район) , ...',
      serviceName: 'ОЭК',
      signs: 'Улица, Открытое пламя, мусор',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '29.01.2025 22:31:31 Опер. 204 Даниленко М. А. - столб освещения - дымится //',
      services: [{ name: 'ОЭК', time: '22:30:54', status: 'Начало реагирования' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 7: Поиск по описанию "чемодан" (media_1789434849859.png)
    // ----------------------------------------------------------------------
    {
      id: '37878798',
      oper: '600',
      arm: '214',
      date: '30.01.25',
      time: '21:13:11',
      type: 'Справка-102',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , Казанский вокзал , Комсомольская площадь , 2 , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 21:14:26 Опер. 600 Давыдова К. В. - 112 Долгопрудный Волкова // забыли на улице около Казанского вокзала чемодан\n30.01.2025 21:16:32 Опер. 600 Давыдова К. В. - пред тел склад забытых вещей и ЛУ МВД Казанский вокзал в смс',
      services: [{ name: 'Служба 102', time: '21:13:11', status: 'Справка дана' }]
    },
    {
      id: '37871262',
      oper: 'СОДЧ (...',
      arm: '',
      date: '30.01.25',
      time: '15:11:06',
      type: 'Человек в опасности',
      victims: 'Нет',
      status: 'Зарегистрирована',
      address: 'Москва , Ясеневая , (ЮАО, Орехово-Борисово Южное) , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '30.01.2025 15:11:06 Стулова Елена Викторовна - к1 ок магазина в зоне разгрузки лежит гр-н лицом в низ. рядом стоит чемодан на колесиках.\n30.01.2025 15:18:08 - Уточненный адрес СМП: г. Москва Ясеневая ул. дом 30 корпус 1\n30.01.2025 15:18:08 - Уточненный повод вызова СМП: Плохо',
      services: [{ name: 'КАСУ СМП', time: '15:11:06', status: 'Принята' }]
    },
    {
      id: '37865986',
      oper: '908',
      arm: '653',
      date: '30.01.25',
      time: '10:59:53',
      type: '102',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , Зеленый проспект , 81 , (ВАО, Новогиреево) , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 11:02:37 Опер. 908 Прохоров К. О. - большой синий чемодан проводов и звуков не слышат\n30.01.2025 11:03:41 Завьялова Анна Александровна - Оператор, создавший КП в Системе-112: 908 Прохоров Кирилл Олегович, дата и время обращения заявителя: 30.01.2025 10:59 Весь список типов происшествия: - Подозрительный предмет Описание про...\n30.01.2025 11:09:49 Опер. 247 Илюшенов Г. П. - Контроль-1, Контроль-6\n30.01.2025 12:02:30 Опер. 372 Рожина Л. В. - Контроль-4\n02.02.2025 13:45:41 Опер. 300 Поляков А. В. - Контроль-У',
      services: [{ name: 'Служба 102', time: '10:59:53', status: 'Проверена' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 8: Поиск по каналу связи "ЕДЦ" (media_1789434861461.png)
    // ----------------------------------------------------------------------
    {
      id: '37875412',
      oper: '908',
      arm: '653',
      date: '30.01.25',
      time: '18:29:52',
      type: '104',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , проезд Нансена , 10 , к. 3 , (СВАО, Свиблово)',
      applicant: { channel: 'ЕДЦ', fio: 'Диспетчер ЕДЦ', aon: '+7 (495) 539-53-53' },
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 18:31:40 Опер. 908 Прохоров К. О. - едц / дозвон к заявителю\n30.01.2025 18:33:13 Опер. 908 Прохоров К. О. - 03 не треб\n30.01.2025 18:38:52 Опер. 395 Чувинова Е. А. - Контроль-1 Контроль-3 Контроль-4\n02.02.2025 22:32:22 Опер. 323 Гусева М. В. - Контроль-у',
      services: [{ name: 'Служба 104', time: '18:29:52', status: 'Принята' }]
    },
    {
      id: '37875381',
      oper: '839',
      arm: '624',
      date: '30.01.25',
      time: '18:28:38',
      type: '104',
      victims: 'Нет',
      status: 'Завершена',
      address: 'Москва , проезд Нансена , 10 , к. 3 , (СВАО, Свиблово)',
      applicant: { channel: 'ЕДЦ', fio: 'Иван ЕДЦ', aon: '+7 (495) 539-53-53' },
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 18:30:07 Опер. 839 Кудяков И. Р. - Иван ЕДЦ / запах газа в подъезде / 03 не треб\n30.01.2025 18:38:30 Опер. 395 Чувинова Е. А. - Контроль-1 Контроль-2',
      services: [{ name: 'Служба 104', time: '18:28:38', status: 'Завершена' }]
    },
    {
      id: '37874954',
      oper: '655',
      arm: '627',
      date: '30.01.25',
      time: '18:09:47',
      type: '104',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , Новопоселковая улица , 9А , (СЗАО, Южное Тушино)',
      applicant: { channel: 'ЕДЦ', fio: 'ЕДЦ Панкратова Лилия', aon: '+7 (495) 539-53-53' },
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 18:11:50 Опер. 655 Егорычева В. И. - едц панкратова лилия //03 не треб.// пахнет на кухне около раковины\n30.01.2025 18:13:21 Опер. 655 Егорычева В. И. - даны рекомендации по действия до приезда газовой службы\n30.01.2025 18:14:24 Опер. 395 Чувинова Е. А. - Контроль-4 Контроль-9\n02.02.2025 22:45:48 Опер. 323 Гусева М. В. - Контроль-у',
      services: [{ name: 'Служба 104', time: '18:09:47', status: 'Принята' }]
    },
    {
      id: '37873580',
      oper: '273',
      arm: '225',
      date: '30.01.25',
      time: '17:04:25',
      type: 'Аварии и происшествия в городском хозяйстве',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , Шенкурский проезд , 12 , (СВАО, Бибирево)',
      applicant: { channel: 'ЕДЦ', fio: 'Диспетчер ЕДЦ Лифты', aon: '+7 (495) 539-53-53' },
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 17:07:07 Опер. 273 Корягина Н. Н. - лифт первый/ ребенок 10 лет/ 103 не треб\n30.01.2025 17:13:59 Опер. 297 Безрученкова Е. Д. - Контроль-4 Контроль-6\n02.02.2025 17:48:09 Опер. 323 Гусева М. В. - Контроль-у',
      services: [{ name: 'Служба 112', time: '17:04:25', status: 'Проверена' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 9: Поиск по источнику "КИС УСС (МЧС)" (media_1789434874837.png)
    // ----------------------------------------------------------------------
    {
      id: '37880923',
      oper: 'КИС УС...',
      arm: '',
      date: '30.01.25',
      time: '23:13:22',
      type: '101',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'г. Москва , ул. Академика Королева , 24 , (СВАО, Марфино) , ...',
      source: 'КИС УСС (МЧС)',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '30.01.2025 23:13:23 МЧС - Сигнализация\n30.01.2025 23:26:12 Гуркина В. В. - Ложная тревога\n30.01.2025 23:35:57 Опер. 247 Илюшенов Г. П. - Контроль-ВИС',
      services: [{ name: 'Служба 101', time: '23:13:22', status: 'Начало реагирования' }]
    },
    {
      id: '37880739',
      oper: 'КИС УС...',
      arm: '763',
      date: '30.01.25',
      time: '22:59:44',
      type: '101',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'г. Москва , ул. Нагорная , 17 , к. 6 , (ЮЗАО, Котловка)',
      source: 'КИС УСС (МЧС)',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '30.01.2025 22:59:44 МЧС - Сигнализация\n30.01.2025 23:11:39 Опер. 247 Илюшенов Г. П. - Контроль-ВИС\n30.01.2025 23:48:15 МЧС Изменились данные заявителя - аон: "*"\n30.01.2025 23:48:15 МЧС Изменение параметра Категория на: Ложное происшествие',
      services: [{ name: 'Служба 101', time: '22:59:44', status: 'Начало реагирования' }]
    },
    {
      id: '37880683',
      oper: 'КИС УС...',
      arm: '763',
      date: '30.01.25',
      time: '22:57:00',
      type: '101',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'г. Москва , ул. Плещеева , 15 , к. 1 , (СВАО, Бибирево) , ...',
      source: 'КИС УСС (МЧС)',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '30.01.2025 22:57:00 МЧС - Сигнализация\n30.01.2025 23:10:55 Опер. 247 Илюшенов Г. П. - Контроль-ВИС',
      services: [{ name: 'Служба 101', time: '22:57:00', status: 'Начало реагирования' }]
    },
    {
      id: '37880393',
      oper: 'КИС УС...',
      arm: '763',
      date: '30.01.25',
      time: '22:37:57',
      type: '101',
      victims: 'Нет',
      status: 'Не оповещено', // Красная ячейка!
      address: 'г. Москва , пр-кт. Ленинский , 10 , к. 5 , (ЦАО, Якиманка)',
      source: 'КИС УСС (МЧС)',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '30.01.2025 22:37:57 Внимание: ДДС не подтвердила получение за 30 сек (Срыв норматива SLA)',
      services: [{ name: 'Служба 101', time: '22:37:57', status: 'НЕ ОПОВЕЩЕНО', class: 'active-react' }]
    },
    {
      id: '37880410',
      oper: '227',
      arm: '512',
      date: '30.01.25',
      time: '23:05:12',
      type: '103',
      victims: '1',
      status: 'Не оповещено', // Красная ячейка!
      address: 'г. Москва , ул. Профсоюзная , 45 , (ЮЗАО, Черемушки)',
      source: 'Граждане',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: false,
      brief: '30.01.2025 23:05:12 Опер. 227 Сидорова Е. В. - травма ноги // ДДС СМП таймаут квитирования 30с',
      services: [{ name: 'Служба 103', time: '23:05:12', status: 'НЕ ОПОВЕЩЕНО', class: 'active-react' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 10: Поиск по оператору ВИС "894" (media_1789434882479.png)
    // ----------------------------------------------------------------------
    {
      id: '37674878',
      oper: '112 Мо...',
      arm: '654',
      date: '21.01.25',
      time: '11:49:38',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , Подольская улица , 25 , (ЮВАО, Марьино) , ...',
      visOperator: '894',
      hasLink: true,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: true,
      isExpanded: false,
      brief: '21.01.2025 11:49:38 112 Мос. обл. - Вызов направлен в другой регион\n21.01.2025 11:49:38 112 Мос. обл. - Скорая в Москву, Москва,\n21.01.2025 11:51:56 Опер. 894 Шунькина К. В. - //кп пришла от 112мо без аб и опер ***\n21.01.2025 11:52:50 Опер. 894 Шунькина К. В. - //дозвон 3 раза - автоответчик// что беспокоит и фио пациента - нет инфо',
      services: [{ name: 'Служба 103', time: '11:49:38', status: 'Проверена' }]
    },
    {
      id: '37672831',
      oper: '112 Мо...',
      arm: '654',
      date: '21.01.25',
      time: '10:03:56',
      type: 'Человек в опасности',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , Яснополянская улица , 7 , к. 2 , (ЮВАО, Рязанский район)',
      visOperator: '894',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: false,
      brief: '21.01.2025 10:03:56 112 Мос. обл. - муж не выходит на связь 2е суток в квартире лают собаки, соседям никто не открывает\n21.01.2025 10:08:10 Опер. 894 Шунькина К. В. - //заявит не на месте\n21.01.2025 10:12:28 - Уточненный адрес СМП: г. Москва Яснополянская ул. дом 7 корпус 2\n21.01.2025 10:12:28 - Уточненный повод вызова СМП: МЧС вскрытие двери\n21.01.2025 10:14:16 Опер. 373 Рожкова Т. В. - Контроль-1 Контроль-6 Контроль-4 Контроль-9',
      services: [{ name: 'Служба 112', time: '10:03:56', status: 'В работе' }]
    },
    {
      id: '37464178',
      oper: '112 Мо...',
      arm: '654',
      date: '11.01.25',
      time: '11:43:57',
      type: '103',
      victims: 'Нет',
      status: 'Проверена',
      address: 'Москва , улица Горбунова , 19 , к. 1 , (ЗАО, Можайский район)',
      visOperator: '894',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: true,
      isExpanded: false,
      brief: '11.01.2025 11:43:57 112 Мос. обл. - плохо\n11.01.2025 11:45:42 Опер. 894 Шунькина К. В. -\n11.01.2025 11:46:53 - Уточненный адрес СМП: г. Москва Горбунова ул. дом 19 корпус 1',
      services: [{ name: 'Служба 103', time: '11:43:57', status: 'Проверена' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 11: Поиск по статусу "Не завершено" (media_1789434927278.png)
    // ----------------------------------------------------------------------
    {
      id: '37907908',
      oper: '878',
      arm: '649',
      date: '01.02.25',
      time: '08:43:43',
      type: 'Справка-103',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Московская область , Видное , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '01.02.2025 08:44:04 Опер. 878 Хайкина С. С. - узнать о госпитализации\n01.02.2025 08:46:17 Опер. 878 Хайкина С. С. - вызов 103 не треб., навести справки о состоянии мамы, которую вчера госпитализировали в районную боль-цу г Видное, комм 112 МО',
      services: [{ name: 'Служба 103', time: '08:43:43', status: 'Справка' }]
    },
    {
      id: '37907904',
      oper: '663',
      arm: '218',
      date: '01.02.25',
      time: '08:43:12',
      type: '102',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , Наримановская улица , 26 , к. 2 , (ВАО, Богородское) , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '01.02.2025 08:47:08 Кузина Оксана Анатольевна - Оператор-663, создавший КП в Системе-112: Петрова Ангелина Сергеевна, дата и время обращения заявителя: 01.02.2025 08:43 шумные строительные работы с 08:00 утра, на стройке за домом Телефон зая...\n01.02.2025 09:17:02 Опер. 517 Черкасова И. С. - Контроль-1 Контроль-4',
      services: [{ name: 'Служба 102', time: '08:43:12', status: 'В работе' }]
    },
    {
      id: '37907880',
      oper: '770',
      arm: '656',
      date: '01.02.25',
      time: '08:41:26',
      type: '102',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , улица Молостовых , 11 , к. 1 , (ВАО, Ивановское)',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '01.02.2025 08:43:42 Наумкина Татьяна Леонидовна - Оператор 770, создавший КП в Системе-112: Лосик Оксана Владимировна, дата и время обращения заявителя: 01.02.2025 08:41 соседка в палкой в руках ломится в кв гр-ки Телефон заявителя:',
      services: [{ name: 'Служба 102', time: '08:41:26', status: 'В работе' }]
    },
    {
      id: '37907879',
      oper: '768',
      arm: '616',
      date: '01.02.25',
      time: '08:41:25',
      type: '104',
      victims: 'Нет',
      status: 'Не завершено', // Красная ячейка!
      address: 'Москва , улица Молостовых , 11 , к. 6 , (ВАО, Ивановское) , в подъезде',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '01.02.2025 08:43:20 Опер. 768 Волков М. А. - 112 Реутов / 03 не треб / свиста, гула не слышал / утечки газа не наблюдает\n01.02.2025 08:46:35 Опер. 530 Свиридова Е. Н. - Контроль-4',
      services: [{ name: 'Служба 104', time: '08:41:25', status: 'В работе' }]
    },

    // ----------------------------------------------------------------------
    // СКРИНШОТ 1 и 2: Базовые карточки (интерактивный аккордеон)
    // ----------------------------------------------------------------------
    {
      id: '37887393',
      oper: '900',
      arm: '232',
      date: '31.01.25',
      time: '10:47:38',
      type: 'ДТП',
      victims: 'Нет',
      status: 'Зарегистрирована',
      address: 'Москва , Третье транспортное кольцо , (ЮАО, Даниловский район) , ...',
      hasLink: true,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: false,
      isExpanded: true,
      services: [
        { name: 'Служба 102', time: '10:48:38', status: 'Получена службой', class: '' },
        { name: 'ЦОДД', time: '10:49:05', status: 'Начало реагирования', class: 'active-react' }
      ],
      applicant: {
        fio: 'Александр Александрович',
        aon: '+7 (916) 126-34-71',
        providedPhone: '+7 (916) 126-34-71',
        channel: 'МТС',
        creationTime: '00:00:59'
      },
      info: 'Разлив топлива: Нет. Легковой транспорт. Нет пострадавших. ТС: [               ] .. Кол-во а/м: 2. Нет пострадавших',
      worklog: 'Оп. 900 в 10:47:44 > Заявителю > [ Разговор завершен. Экстренные службы направлены на место. ]'
    },
    {
      id: '37887392',
      oper: 'СОДЧ (...',
      arm: '',
      date: '31.01.25',
      time: '10:47:36',
      type: '',
      victims: 'Нет',
      status: 'Зарегистрирована',
      address: 'Москва , Гончарова , 13 , (СВАО, Бутырский район) , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: true,
      hasTimer: true,
      isVis: true,
      isExpanded: true,
      services: [
        { name: 'Служба 102', time: '10:47:36', status: 'Принята', class: 'accepted' }
      ],
      applicant: {
        fio: 'Уланова Александра Александровна',
        aon: '+7 (903) 841-19-22',
        providedPhone: '+7 (903) 841-19-22',
        channel: 'Билайн',
        creationTime: '00:01:14'
      },
      visDescription: '31.01.2025 10:47:36 Уланова Александра Александровна - на пр.ч. [ ДТП с участием двух ТС ] +скрылся, так же второй участник ударил з-ля ,после чего скрылся с места дтп'
    },
    {
      id: '37478277',
      oper: '693',
      arm: '640',
      date: '12.01.25',
      time: '00:07:37',
      type: '101, Дополнительный звонок от заявителя',
      victims: 'Нет',
      status: 'Отказ', // Красная ячейка!
      address: 'Москва , Полтавская улица , 47 , к. 2 , (САО, Савёловский район) , ...',
      hasLink: false,
      isPinned: false,
      isEmergency: false,
      hasTimer: false,
      isVis: false,
      isExpanded: false,
      brief: '12.01.2025 00:10:51 Опер. 553 Петрова А. С. - что горит не видит // наблюдают с 15 этажа // нет пострадавших',
      services: [{ name: 'Служба 101', time: '00:07:37', status: 'Отказ' }],
      applicant: { fio: 'Иванова В.Ю.', aon: '+7 (499) 234-11-22', channel: 'МегаФон', creationTime: '00:00:17' }
    }
  ];

  // Состояние грида
  const state = {
    incidents: JSON.parse(JSON.stringify(INITIAL_INCIDENTS)),
    filterQuery: '',
    selectedViewMode: 'all',
    autoUpdate: true,
    queueOnly: false,
    currentPage: 1,
    pageSize: 10,
    totalRecords: 23030,
    sortField: 'time',
    sortAsc: false,
    extFilter: {
      cardNumber: '',
      type: '',
      signs: '',
      subject: 'г. Москва',
      applicant: '',
      operator: '',
      arm: '',
      address: '',
      okrug: '',
      district: '',
      descriptiveAddress: '',
      service: '',
      description: '',
      channel: '',
      source: '',
      status: '',
      visOperator: ''
    },
    descriptiveAddressQuery: ''
  };

  // Элементы DOM
  const dom = {
    tableBody: document.getElementById('incidentsTableBody'),
    clockHM: document.getElementById('clockHM'),
    clockSec: document.getElementById('clockSec'),
    searchInput: document.getElementById('gridSearchInput'),
    btnResetSearch: document.getElementById('btnResetSearch'),
    toggleExtendedSearch: document.getElementById('toggleExtendedSearch'),
    extendedSearchPanel: document.getElementById('extendedSearchPanel'),
    btnSearchParams: document.getElementById('btnSearchParams'),
    btnSearchReset: document.getElementById('btnSearchReset'),
    btnSignsOpen: document.getElementById('btnSignsOpen'),
    signsModal: document.getElementById('signsModal'),
    btnCloseSigns: document.getElementById('btnCloseSigns'),
    btnCancelSigns: document.getElementById('btnCancelSigns'),
    btnApplySigns: document.getElementById('btnApplySigns'),
    toggleAutoUpdate: document.getElementById('toggleAutoUpdate'),
    toggleQueueCalls: document.getElementById('toggleQueueCalls'),
    viewModeSelect: document.getElementById('viewModeSelect'),
    btnCreateNewCard: document.getElementById('btnCreateNewCard'),
    toggleAllRows: document.getElementById('toggleAllRows'),
    collapseGridToggle: document.getElementById('collapseGridToggle'),
    gridTitleChevron: document.getElementById('gridTitleChevron'),
    gridContainer: document.getElementById('gridContainer'),
    pageSelect: document.getElementById('pageSelect'),
    pageSizeSelect: document.getElementById('pageSizeSelect'),
    paginationRangeLabel: document.getElementById('paginationRangeLabel'),
    btnPagePrev: document.getElementById('btnPagePrev'),
    btnPageNext: document.getElementById('btnPageNext'),
    btnWikiHelp: document.getElementById('btnWikiHelp'),
    stpModal: document.getElementById('stpModal'),
    btnCloseStp: document.getElementById('btnCloseStp'),
    btnCancelStp: document.getElementById('btnCancelStp'),
    btnSendStp: document.getElementById('btnSendStp'),
    btnBreakMenu: document.getElementById('btnBreakMenu'),
    breakModal: document.getElementById('breakModal'),
    btnCloseBreak: document.getElementById('btnCloseBreak'),
    btnCancelBreak: document.getElementById('btnCancelBreak'),
    btnConfirmBreak: document.getElementById('btnConfirmBreak'),
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // 1. ИНИЦИАЛИЗАЦИЯ И ЧАСЫ РЕАЛЬНОГО ВРЕМЕНИ
  // ==========================================================================
  function initClock() {
    function tick() {
      if (!state.autoUpdate) return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      if (dom.clockHM) dom.clockHM.textContent = `${hh}:${mm}`;
      if (dom.clockSec) dom.clockSec.textContent = `:${ss}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ==========================================================================
  // 2. ОТРИСОВКА ТАБЛИЦЫ ПРОИСШЕСТВИЙ (С КРАСНЫМИ ЯЧЕЙКАМИ И СИНЕЙ ПОДСВЕТКОЙ)
  // ==========================================================================
  function renderTable() {
    if (!dom.tableBody) return;

    const filtered = getFilteredIncidents();
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const paged = filtered.slice(startIndex, startIndex + state.pageSize);

    dom.tableBody.innerHTML = '';

    if (paged.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="13" style="text-align: center; padding: 28px; color: #9aa2ac;">
          По заданным критериям поиска происшествий не найдено. Нажмите «сбросить» для возврата к полному списку.
        </td>
      `;
      dom.tableBody.appendChild(emptyRow);
      updatePaginationControls(filtered.length);
      return;
    }

    // Собираем поисковые слова для синей подсветки
    const searchTerms = [];
    if (state.filterQuery && state.filterQuery.trim()) {
      searchTerms.push(state.filterQuery.trim());
    }
    if (state.extFilter.address && state.extFilter.address.trim()) {
      searchTerms.push(state.extFilter.address.trim());
    }
    if (state.extFilter.descriptiveAddress && state.extFilter.descriptiveAddress.trim()) {
      searchTerms.push(state.extFilter.descriptiveAddress.trim());
    }

    paged.forEach((item) => {
      // 1. Основная строка карточки
      const mainRow = document.createElement('tr');
      mainRow.className = `incident-row ${item.isExpanded ? 'expanded' : ''}`;
      mainRow.dataset.id = item.id;

      // Определение классов статуса
      let statusClass = 'processed';
      if (item.status === 'Завершена') statusClass = 'completed';
      else if (item.status === 'Зарегистрирована') statusClass = 'registered';
      else if (item.status === 'Проверена') statusClass = 'verified';
      else if (item.status === 'Не оповещено') statusClass = 'not-notified';

      // ТРЕБОВАНИЕ 3: Ярко-красная заливка ВСЕЙ ячейки статуса для негативных статусов (#d32f2f)
      const dangerStatuses = ['Не завершено', 'Не оповещено', 'Отказ'];
      const isDanger = dangerStatuses.includes(item.status);
      const statusTdClass = isDanger ? 'col-status status-danger-cell' : 'col-status';
      const statusBadgeClass = isDanger ? 'status-badge danger-status' : `status-badge ${statusClass}`;

      // Форматирование времени (жирные минуты)
      const timeParts = item.time.split(':');
      const timeFormatted = timeParts.length >= 2
        ? `<span class="time-bold">${timeParts[0]}:${timeParts[1]}</span><span class="time-sec">:${timeParts[2] || '00'}</span>`
        : item.time;

      // ТРЕБОВАНИЕ 4: Синяя подсветка адреса и описательного адреса (media_1789433608293.png)
      let addressHtml = item.address || '—';
      if (searchTerms.length > 0 && item.address) {
        addressHtml = highlightMultiText(item.address, searchTerms);
      }

      // Если есть описательный адрес (или при поиске по нему) — выводим синюю плашку
      let descriptiveBannerHtml = '';
      const descQuery = state.extFilter.descriptiveAddress ? state.extFilter.descriptiveAddress.toLowerCase() : '';
      const quickQuery = state.filterQuery ? state.filterQuery.toLowerCase() : '';
      const isDescriptiveMatch = (descQuery && item.descriptiveAddress && item.descriptiveAddress.toLowerCase().includes(descQuery)) ||
        (quickQuery && item.descriptiveAddress && item.descriptiveAddress.toLowerCase().includes(quickQuery)) ||
        (!descQuery && !quickQuery && item.descriptiveAddress && (item.id === '37478276' || item.id === '37621363'));

      if (isDescriptiveMatch && item.descriptiveAddress) {
        const highlightedBanner = searchTerms.length > 0 ? highlightMultiText(item.descriptiveAddress, searchTerms) : item.descriptiveAddress;
        descriptiveBannerHtml = `<span class="descriptive-address-pill" title="Описательный адрес">${highlightedBanner}</span>`;
      }

      mainRow.innerHTML = `
        <td class="col-chevron" data-action="toggle-accordion" title="Развернуть/свернуть детали">
          ${item.isExpanded ? '▲' : '▼'}
        </td>
        <td class="col-icons">
          <div class="row-icon-group">
            ${item.hasLink ? '<span class="link-badge-pill" title="Связанные карточки">🔗</span>' : ''}
            <span class="icon-pin ${item.isPinned ? 'pinned' : ''}" data-action="toggle-pin" title="Закрепить карточку на экране">📌</span>
            ${item.isEmergency ? '<span class="icon-lightning" title="Важное происшествие (устанавливается службой 112)">⚡</span>' : ''}
            ${item.hasTimer ? '<span class="icon-timer" title="Таймер реагирования">⏱️</span>' : ''}
          </div>
        </td>
        <td class="col-oper ${item.isVis ? 'vis' : ''}" title="${item.isVis ? 'Внешняя система ВИС' : 'Оператор 112'}">${item.oper}</td>
        <td class="col-arm">${item.arm || ''}</td>
        <td class="col-num" data-action="open-card" title="Нажмите для перехода в АРМ Оператора">${item.id}</td>
        <td class="col-date">${item.date}</td>
        <td class="col-time">${timeFormatted}</td>
        <td class="col-type">
          ${item.type ? `<span>${item.type}</span>` : '<span class="type-vis-empty">— (ВИС без опроса)</span>'}
        </td>
        <td class="col-victims ${item.victims === 'Есть' ? 'yes' : 'no'}">${item.victims}</td>
        <td class="${statusTdClass}">
          <span class="${statusBadgeClass}">${item.status}</span>
        </td>
        <td class="col-address" title="${item.address}">${descriptiveBannerHtml}${addressHtml}</td>
        <td class="col-control" title="Удалить / архивировать">🗑️</td>
        <td class="col-check" data-action="toggle-check" title="Проверка карточки">
          <span style="cursor: pointer;">✔️</span>
        </td>
      `;

      dom.tableBody.appendChild(mainRow);

      // 2. Раскрывающийся блок подробностей (Аккордеон по скриншоту 2)
      if (item.isExpanded) {
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'incident-details-row visible';
        detailsRow.dataset.parent = item.id;

        if (item.isVis) {
          // Вариант 2: Карточка от ВИС (СОДЧ МВД)
          detailsRow.innerHTML = `
            <td colspan="13">
              <div class="details-wrapper vis-wrapper">
                <div class="detail-line">
                  <span class="line-label">Описание:</span>
                  <span class="brief-content" style="color: #f1f5f9;">${item.visDescription || 'Информация передана из внешней системы.'}</span>
                </div>
                <div class="detail-line">
                  <span class="line-label">Службы:</span>
                  <div class="services-flow">
                    ${renderServicesHtml(item.services)}
                  </div>
                </div>
                <div class="detail-line">
                  <span class="line-label">Заявитель:</span>
                  <div class="applicant-fields-flow">
                    <span class="sub-field">
                      <span class="sub-field-label">АОН:</span>
                      <span class="sub-field-box">${item.applicant ? item.applicant.aon : '—'}</span>
                    </span>
                    <span class="sub-field">
                      <span class="sub-field-label">предоставленный телефон:</span>
                      <span class="sub-field-box">${item.applicant ? item.applicant.providedPhone : '—'}</span>
                    </span>
                  </div>
                </div>
                <div class="vis-notice">
                  * Карточка поступила из ВИС: номер АРМ отсутствует, опросная карта не предусмотрена, данные зафиксированы внешним ведомством.
                </div>
              </div>
            </td>
          `;
        } else {
          // Вариант 1: Карточка создана специалистом-112 со всеми признаками
          detailsRow.innerHTML = `
            <td colspan="13">
              <div class="details-wrapper">
                <div class="detail-line">
                  <span class="line-label">Службы:</span>
                  <div class="services-flow">
                    ${renderServicesHtml(item.services)}
                  </div>
                </div>
                <div class="detail-line">
                  <span class="line-label">Заявитель:</span>
                  <div class="applicant-fields-flow">
                    <span class="sub-field-box" style="min-width: 170px; font-weight: 600;">
                      ${item.applicant ? item.applicant.fio : 'Заявитель'}
                    </span>
                    <span class="sub-field">
                      <span class="sub-field-label">АОН:</span>
                      <span class="sub-field-box">${item.applicant ? item.applicant.aon : '—'}</span>
                    </span>
                    <span class="sub-field">
                      <span class="sub-field-label">предоставленный телефон:</span>
                      <span class="sub-field-box">${item.applicant ? item.applicant.providedPhone : '—'}</span>
                    </span>
                    <span class="sub-field">
                      <span class="sub-field-label">Канал связи:</span>
                      <span class="sub-field-text" style="color: #60a5fa;">${item.applicant ? item.applicant.channel : 'МТС'}</span>
                    </span>
                    <span class="sub-field" style="margin-left: 10px;">
                      <span class="sub-field-label">Создание:</span>
                      <span class="sub-field-text" style="font-family: var(--font-mono);">${item.applicant ? item.applicant.creationTime : '00:00:59'}</span>
                    </span>
                  </div>
                </div>
                <div class="detail-line">
                  <span class="line-label">Информация:</span>
                  <div class="info-text-block">
                    <span>${item.info || 'Нет дополнительных сведений.'}</span>
                  </div>
                </div>
                <div class="detail-line">
                  <span class="line-label">Отработки:</span>
                  <div class="worklog-block">
                    <span>${item.worklog || 'Оп. 900 в 10:47:44 > Заявителю > [ Разговор завершен. Экстренные службы направлены на место. ]'}</span>
                  </div>
                </div>
              </div>
            </td>
          `;
        }

        dom.tableBody.appendChild(detailsRow);
      }
      // 3. Краткая строка описания (скриншоты 3, 4, 6-11)
      else if (item.brief) {
        const briefRow = document.createElement('tr');
        briefRow.className = 'incident-brief-row';
        briefRow.dataset.parent = item.id;
        const briefFormatted = item.brief.split('\n').join('<br>');
        briefRow.innerHTML = `
          <td colspan="13">
            <span class="brief-label">Описание:</span>
            <span class="brief-content">${briefFormatted}</span>
          </td>
        `;
        dom.tableBody.appendChild(briefRow);
      }
    });

    updatePaginationControls(filtered.length);
  }

  function renderServicesHtml(services) {
    if (!services || services.length === 0) {
      return '<span style="color: #717782;">Службы не назначены</span>';
    }
    return services.map(s => `
      <div class="service-status-item ${s.class || ''}">
        <span class="srv-name">${s.name}</span>
        <span style="color: #64748b;">—</span>
        <span class="srv-time">${s.time}</span>
        <span class="srv-status">${s.status}</span>
      </div>
    `).join('');
  }

  // ТРЕБОВАНИЕ 4: Функция синей подсветки найденных подстрок
  function highlightMultiText(text, queries) {
    if (!text || !queries || queries.length === 0) return text;
    let result = text;
    queries.forEach(q => {
      const clean = q.trim();
      if (!clean) return;
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${escaped})`, 'gi');
      result = result.replace(re, '<span class="addr-highlight">$1</span>');
    });
    return result;
  }

  // ==========================================================================
  // 3. ФИЛЬТРАЦИЯ И ПОИСК (16 ПОЛЕЙ В РЕАЛЬНОМ ВРЕМЕНИ)
  // ==========================================================================
  function getFilteredIncidents() {
    const q = state.filterQuery.trim().toLowerCase();

    return state.incidents.filter(item => {
      // 1. Быстрый поиск в строке шапки
      if (q) {
        const matchNum = item.id.toLowerCase().includes(q);
        const matchOper = String(item.oper).toLowerCase().includes(q);
        const matchType = item.type.toLowerCase().includes(q);
        const matchAddr = item.address.toLowerCase().includes(q);
        const matchDescAddr = item.descriptiveAddress && item.descriptiveAddress.toLowerCase().includes(q);
        const matchBrief = item.brief && item.brief.toLowerCase().includes(q);
        const matchApplicant = item.applicant && (
          typeof item.applicant === 'string'
            ? item.applicant.toLowerCase().includes(q)
            : ((item.applicant.fio && item.applicant.fio.toLowerCase().includes(q)) ||
               (item.applicant.aon && item.applicant.aon.includes(q)))
        );
        const matchService = item.serviceName && item.serviceName.toLowerCase().includes(q);

        if (!matchNum && !matchOper && !matchType && !matchAddr && !matchDescAddr && !matchBrief && !matchApplicant && !matchService) {
          return false;
        }
      }

      // 2. Фильтр выпадающего списка «Выберите что показать»
      if (state.selectedViewMode === 'my' && item.oper !== '227') return false;
      if (state.selectedViewMode === 'active' && (item.status === 'Завершена' || item.status === 'Отказ')) return false;
      if (state.selectedViewMode === 'urgent' && !item.isEmergency) return false;
      if (state.selectedViewMode === 'sla' && item.status !== 'Не оповещено') return false;

      // 3. Фильтр очереди
      if (state.queueOnly && item.status !== 'Зарегистрирована') return false;

      // 4. Расширенные фильтры (сетка 16 полей)
      const ext = state.extFilter;

      // Номер карточки
      if (ext.cardNumber && !item.id.includes(ext.cardNumber)) return false;

      // Тип происшествия
      if (ext.type && ext.type !== '') {
        const itemType = item.type.toLowerCase();
        const targetType = ext.type.toLowerCase();
        if (!itemType.includes(targetType)) return false;
      }

      // Признаки происшествия (из модального окна)
      if (ext.signs) {
        const signsList = ext.signs.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        const matchInItem = signsList.some(s => {
          const inSigns = item.signs && item.signs.toLowerCase().includes(s);
          const inBrief = item.brief && item.brief.toLowerCase().includes(s);
          const inInfo = item.info && item.info.toLowerCase().includes(s);
          const inType = item.type && item.type.toLowerCase().includes(s);
          return inSigns || inBrief || inInfo || inType;
        });
        if (!matchInItem) return false;
      }

      // Субъект РФ
      if (ext.subject && ext.subject !== '') {
        const targetSubj = ext.subject.toLowerCase();
        if (targetSubj === 'г. москва' || targetSubj === 'москва') {
          if (!item.address.toLowerCase().includes('москва') && !item.address.toLowerCase().includes('г. москва')) {
            return false;
          }
        } else {
          if (!item.address.toLowerCase().includes(targetSubj)) return false;
        }
      }

      // По адресу
      if (ext.address && !item.address.toLowerCase().includes(ext.address.toLowerCase())) return false;

      // Округ (поддержка "ЮАО, ЮЗАО" или отдельных округов)
      if (ext.okrug && ext.okrug !== '') {
        const okrugs = ext.okrug.split(',').map(o => o.trim().toLowerCase());
        const inAddr = okrugs.some(o => item.address.toLowerCase().includes(o));
        if (!inAddr) return false;
      }

      // Район
      if (ext.district && ext.district !== '') {
        if (!item.address.toLowerCase().includes(ext.district.toLowerCase())) return false;
      }

      // Описательный адрес (с подсветкой)
      if (ext.descriptiveAddress) {
        const qDA = ext.descriptiveAddress.toLowerCase();
        const inDesc = item.descriptiveAddress && item.descriptiveAddress.toLowerCase().includes(qDA);
        const inAddr = item.address && item.address.toLowerCase().includes(qDA);
        if (!inDesc && !inAddr) return false;
      }

      // Заявитель (ФИО или АОН)
      if (ext.applicant) {
        const qA = ext.applicant.toLowerCase();
        if (typeof item.applicant === 'string') {
          if (!item.applicant.toLowerCase().includes(qA)) return false;
        } else if (item.applicant) {
          const fio = item.applicant.fio ? item.applicant.fio.toLowerCase() : '';
          const aon = item.applicant.aon ? item.applicant.aon : '';
          if (!fio.includes(qA) && !aon.includes(ext.applicant)) return false;
        } else {
          return false;
        }
      }

      // Оператор
      if (ext.operator && !String(item.oper).toLowerCase().includes(ext.operator.toLowerCase())) return false;

      // АРМ
      if (ext.arm && !String(item.arm).includes(ext.arm)) return false;

      // Служба (101, 102, 103, 104, ОЭК, ЦОДД и др.)
      if (ext.service && ext.service !== '') {
        const qS = ext.service.toLowerCase();
        const inServiceName = item.serviceName && item.serviceName.toLowerCase().includes(qS);
        const inServices = item.services && item.services.some(s => s.name.toLowerCase().includes(qS));
        const inType = item.type && item.type.toLowerCase().includes(qS);
        if (!inServiceName && !inServices && !inType) return false;
      }

      // Описание (например, "чемодан")
      if (ext.description) {
        const qD = ext.description.toLowerCase();
        const inBrief = item.brief && item.brief.toLowerCase().includes(qD);
        const inInfo = item.info && item.info.toLowerCase().includes(qD);
        const inVisDesc = item.visDescription && item.visDescription.toLowerCase().includes(qD);
        const inWorklog = item.worklog && item.worklog.toLowerCase().includes(qD);
        if (!inBrief && !inInfo && !inVisDesc && !inWorklog) return false;
      }

      // Канал связи (ЕДЦ, МТС, Телефон и др.)
      if (ext.channel && ext.channel !== '') {
        const qC = ext.channel.toLowerCase();
        const channel = item.applicant && item.applicant.channel ? item.applicant.channel.toLowerCase() : '';
        const inBrief = item.brief && item.brief.toLowerCase().includes(qC);
        if (!channel.includes(qC) && !inBrief) return false;
      }

      // Источник происшествия (КИС УСС (МЧС), СОДЧ (МВД) и др.)
      if (ext.source && ext.source !== '') {
        const qSrc = ext.source.toLowerCase();
        const itemSrc = item.source ? item.source.toLowerCase() : '';
        const inOper = item.oper ? String(item.oper).toLowerCase() : '';
        const inBrief = item.brief ? item.brief.toLowerCase() : '';
        if (!itemSrc.includes(qSrc) && !inOper.includes(qSrc.slice(0, 5)) && !inBrief.includes(qSrc.slice(0, 5))) {
          return false;
        }
      }

      // Статус (Все, Завершена, Отработана, Не завершено, Не оповещено, Отказ)
      if (ext.status && ext.status !== '' && ext.status !== 'Все') {
        if (item.status !== ext.status) return false;
      }

      // Оператор ВИС (например "894")
      if (ext.visOperator) {
        const qVO = ext.visOperator.toLowerCase();
        const itemVO = item.visOperator ? item.visOperator.toLowerCase() : '';
        const inBrief = item.brief ? item.brief.toLowerCase() : '';
        const inVisDesc = item.visDescription ? item.visDescription.toLowerCase() : '';
        if (!itemVO.includes(qVO) && !inBrief.includes(qVO) && !inVisDesc.includes(qVO)) {
          return false;
        }
      }

      return true;
    });
  }

  // ==========================================================================
  // 4. ПАГИНАЦИЯ
  // ==========================================================================
  function updatePaginationControls(totalFiltered) {
    const totalPages = Math.max(1, Math.ceil(totalFiltered / state.pageSize));
    if (state.currentPage > totalPages) state.currentPage = totalPages;

    const start = totalFiltered === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, totalFiltered);

    if (dom.paginationRangeLabel) {
      dom.paginationRangeLabel.textContent = `${start}-${end} из ${totalFiltered}`;
    }

    if (dom.btnPagePrev) dom.btnPagePrev.disabled = state.currentPage <= 1;
    if (dom.btnPageNext) dom.btnPageNext.disabled = state.currentPage >= totalPages;

    if (dom.pageSelect) {
      dom.pageSelect.value = String(state.currentPage);
    }
  }

  // ==========================================================================
  // 5. УПРАВЛЕНИЕ КРЕСТИКАМИ ОЧИСТКИ [✕] В ПОЛЯХ
  // ==========================================================================
  function updateClearButtonsVisibility() {
    const fieldIds = [
      'extCardNumber', 'extType', 'extSigns', 'extSubject', 'extApplicant',
      'extOperator', 'extArm', 'extAddress', 'extOkrug', 'extDistrict',
      'extDescriptiveAddress', 'extService', 'extDescription',
      'extChannel', 'extSource', 'extStatus', 'extVisOperator'
    ];
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      const btn = document.querySelector(`.ext-clear-btn[data-target="${id}"]`);
      if (el && btn) {
        const val = el.value ? el.value.trim() : '';
        if (val && val !== 'Все') {
          btn.classList.add('visible');
        } else {
          btn.classList.remove('visible');
        }
      }
    });
  }

  // ==========================================================================
  // 6. ОБРАБОТЧИКИ СОБЫТИЙ И ИНТЕРАКТИВНОСТЬ
  // ==========================================================================
  function setupEventListeners() {
    // 1. Поиск происшествий в шапке
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (e) => {
        state.filterQuery = e.target.value;
        state.currentPage = 1;
        renderTable();
      });
    }

    // Кнопка сбросить в шапке
    if (dom.btnResetSearch) {
      dom.btnResetSearch.addEventListener('click', () => {
        if (dom.searchInput) dom.searchInput.value = '';
        state.filterQuery = '';
        clearExtendedFilter();
        state.currentPage = 1;
        renderTable();
        showToast('Поисковые фильтры сброшены');
      });
    }

    // Спойлер раскрытия расширенного поиска
    if (dom.toggleExtendedSearch) {
      dom.toggleExtendedSearch.addEventListener('click', () => {
        const isVisible = dom.extendedSearchPanel.classList.toggle('visible');
        dom.toggleExtendedSearch.classList.toggle('expanded', isVisible);
        updateClearButtonsVisibility();
      });
    }

    // ТРЕБОВАНИЕ 1 & 5: Кнопка «[ искать по параметрам ]»
    if (dom.btnSearchParams) {
      dom.btnSearchParams.addEventListener('click', () => {
        applyExtendedSearch();
      });
    }

    // ТРЕБОВАНИЕ 1 & 5: Кнопка «[ сбросить ]»
    if (dom.btnSearchReset) {
      dom.btnSearchReset.addEventListener('click', () => {
        clearExtendedFilter();
        state.currentPage = 1;
        renderTable();
        showToast('Расширенный поиск сброшен');
      });
    }

    // Обработка Enter и отслеживание ввода в расширенном поиске
    const extPanel = document.getElementById('extendedSearchPanel');
    if (extPanel) {
      extPanel.addEventListener('input', () => {
        updateClearButtonsVisibility();
      });
      extPanel.addEventListener('change', () => {
        updateClearButtonsVisibility();
      });
      extPanel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyExtendedSearch();
        }
      });

      // Клик по крестикам [✕] внутри полей
      extPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('.ext-clear-btn');
        if (!btn) return;
        const targetId = btn.dataset.target;
        if (!targetId) return;
        const field = document.getElementById(targetId);
        if (field) {
          if (field.tagName === 'SELECT') {
            field.selectedIndex = 0;
          } else {
            field.value = '';
          }
          btn.classList.remove('visible');
          applyExtendedSearch(false);
        }
      });
    }

    // Функция применения фильтров
    function applyExtendedSearch(showToastNotice = true) {
      state.extFilter.cardNumber         = (document.getElementById('extCardNumber') || {value:''}).value.trim();
      state.extFilter.type               = (document.getElementById('extType') || {value:''}).value;
      state.extFilter.signs              = (document.getElementById('extSigns') || {value:''}).value.trim();
      state.extFilter.subject            = (document.getElementById('extSubject') || {value:''}).value;
      state.extFilter.address            = (document.getElementById('extAddress') || {value:''}).value.trim();
      state.extFilter.okrug              = (document.getElementById('extOkrug') || {value:''}).value;
      state.extFilter.district           = (document.getElementById('extDistrict') || {value:''}).value;
      state.extFilter.descriptiveAddress = (document.getElementById('extDescriptiveAddress') || {value:''}).value.trim();
      state.extFilter.applicant          = (document.getElementById('extApplicant') || {value:''}).value.trim();
      state.extFilter.operator           = (document.getElementById('extOperator') || {value:''}).value.trim();
      state.extFilter.arm                = (document.getElementById('extArm') || {value:''}).value.trim();
      state.extFilter.service            = (document.getElementById('extService') || {value:''}).value;
      state.extFilter.description        = (document.getElementById('extDescription') || {value:''}).value.trim();
      state.extFilter.channel            = (document.getElementById('extChannel') || {value:''}).value;
      state.extFilter.source             = (document.getElementById('extSource') || {value:''}).value;
      state.extFilter.status             = (document.getElementById('extStatus') || {value:''}).value;
      state.extFilter.visOperator        = (document.getElementById('extVisOperator') || {value:''}).value.trim();

      state.descriptiveAddressQuery = state.extFilter.descriptiveAddress;
      state.currentPage = 1;
      updateClearButtonsVisibility();
      renderTable();

      if (showToastNotice) {
        const count = getFilteredIncidents().length;
        showToast(`Найдено: ${count} карточек`);
      }
    }

    // ТРЕБОВАНИЕ 2: Модальное окно «Признаки происшествия» (media_1789433582116.png)
    function openSignsModal() {
      if (dom.signsModal) dom.signsModal.classList.add('active');
    }

    function closeSignsModal() {
      if (dom.signsModal) dom.signsModal.classList.remove('active');
    }

    if (dom.btnSignsOpen) dom.btnSignsOpen.addEventListener('click', openSignsModal);
    const extSignsInput = document.getElementById('extSigns');
    if (extSignsInput) extSignsInput.addEventListener('click', openSignsModal);

    if (dom.btnCloseSigns) dom.btnCloseSigns.addEventListener('click', closeSignsModal);
    if (dom.btnCancelSigns) dom.btnCancelSigns.addEventListener('click', closeSignsModal);

    if (dom.signsModal) {
      dom.signsModal.addEventListener('click', (e) => {
        if (e.target === dom.signsModal) closeSignsModal();
      });

      // Переключение тегов категорий (мультивыбор как на скриншоте 2)
      dom.signsModal.addEventListener('click', (e) => {
        const optBtn = e.target.closest('.signs-opt-btn');
        if (optBtn) {
          optBtn.classList.toggle('active');
          return;
        }

        // Переключение вопросов Да / Нет
        const qBtn = e.target.closest('.signs-q-btn');
        if (qBtn) {
          const group = qBtn.closest('.signs-q-group');
          if (group) {
            group.querySelectorAll('.signs-q-btn').forEach(b => b.classList.remove('active'));
            qBtn.classList.add('active');
          }
        }
      });
    }

    // Кнопка «Применить» в модалке признаков
    if (dom.btnApplySigns) {
      dom.btnApplySigns.addEventListener('click', () => {
        const selected = [];

        // Собираем активные кнопки категорий
        document.querySelectorAll('.signs-opt-btn.active').forEach(b => {
          const val = b.dataset.value || b.textContent.trim();
          if (val) selected.push(val);
        });

        const signsText = selected.join(', ');
        if (extSignsInput) extSignsInput.value = signsText;
        state.extFilter.signs = signsText;

        updateClearButtonsVisibility();
        closeSignsModal();
        showToast('Признаки происшествия применены');
      });
    }

    // 2. Тумблер «Автообновление»
    if (dom.toggleAutoUpdate) {
      dom.toggleAutoUpdate.addEventListener('click', () => {
        state.autoUpdate = !state.autoUpdate;
        dom.toggleAutoUpdate.classList.toggle('active', state.autoUpdate);
        showToast(state.autoUpdate ? 'Автообновление включено' : 'Автообновление приостановлено');
      });
    }

    // Тумблер «Обращения в очереди»
    if (dom.toggleQueueCalls) {
      dom.toggleQueueCalls.addEventListener('click', () => {
        state.queueOnly = !state.queueOnly;
        dom.toggleQueueCalls.classList.toggle('active', state.queueOnly);
        renderTable();
      });
    }

    // Выберите что показать
    if (dom.viewModeSelect) {
      dom.viewModeSelect.addEventListener('change', (e) => {
        state.selectedViewMode = e.target.value;
        state.currentPage = 1;
        renderTable();
      });
    }

    // Сворачивание / разворачивание всей таблицы
    if (dom.collapseGridToggle) {
      dom.collapseGridToggle.addEventListener('click', () => {
        const isHidden = dom.gridContainer.style.display === 'none';
        dom.gridContainer.style.display = isHidden ? 'block' : 'none';
        dom.gridTitleChevron.textContent = isHidden ? '▲' : '▼';
      });
    }

    // Развернуть / свернуть все строки
    if (dom.toggleAllRows) {
      dom.toggleAllRows.addEventListener('click', () => {
        const anyCollapsed = state.incidents.some(i => !i.isExpanded);
        state.incidents.forEach(i => i.isExpanded = anyCollapsed);
        dom.toggleAllRows.textContent = anyCollapsed ? '▲' : '▼';
        renderTable();
      });
    }

    // Кнопка перехода к созданию новой карточки
    if (dom.btnCreateNewCard) {
      dom.btnCreateNewCard.addEventListener('click', () => {
        window.location.href = '/operator.html?action=new_card';
      });
    }

    // Пагинация
    if (dom.pageSizeSelect) {
      dom.pageSizeSelect.addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        state.currentPage = 1;
        renderTable();
      });
    }

    if (dom.pageSelect) {
      dom.pageSelect.addEventListener('change', (e) => {
        state.currentPage = parseInt(e.target.value, 10);
        renderTable();
      });
    }

    if (dom.btnPagePrev) {
      dom.btnPagePrev.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage--;
          renderTable();
        }
      });
    }

    if (dom.btnPageNext) {
      dom.btnPageNext.addEventListener('click', () => {
        const totalFiltered = getFilteredIncidents().length;
        const totalPages = Math.ceil(totalFiltered / state.pageSize);
        if (state.currentPage < totalPages) {
          state.currentPage++;
          renderTable();
        }
      });
    }

    // Делегирование кликов по строкам таблицы
    if (dom.tableBody) {
      dom.tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('.incident-row');
        if (!row) return;

        const incidentId = row.dataset.id;
        const item = state.incidents.find(i => i.id === incidentId);
        if (!item) return;

        // Клик по шеврону аккордеона
        if (target.dataset.action === 'toggle-accordion' || target.classList.contains('col-chevron')) {
          item.isExpanded = !item.isExpanded;
          renderTable();
          return;
        }

        // Клик по булавке (закрепление)
        if (target.dataset.action === 'toggle-pin' || target.classList.contains('icon-pin')) {
          item.isPinned = !item.isPinned;
          renderTable();
          showToast(item.isPinned ? `Карточка №${item.id} закреплена` : `Карточка №${item.id} откреплена`);
          return;
        }

        // Клик по галочке проверки
        if (target.dataset.action === 'toggle-check' || target.closest('.col-check')) {
          item.status = item.status === 'Проверена' ? 'Отработана' : 'Проверена';
          renderTable();
          showToast(`Карточка №${item.id} статус: ${item.status}`);
          return;
        }

        // Клик по номеру карточки — переход в АРМ Оператора
        if (target.dataset.action === 'open-card' || target.classList.contains('col-num')) {
          window.location.href = `/operator.html?incident_id=${item.id}&ticket=1`;
          return;
        }

        // Одиночный клик по телу строки: переключаем аккордеон
        item.isExpanded = !item.isExpanded;
        renderTable();
      });

      // Двойной клик по строке карточки — быстрый переход в режим оператора
      dom.tableBody.addEventListener('dblclick', (e) => {
        const row = e.target.closest('.incident-row');
        if (!row) return;
        const incidentId = row.dataset.id;
        window.location.href = `/operator.html?incident_id=${incidentId}&ticket=1`;
      });
    }

    // Модальные окна СТП и Перерыва
    if (dom.btnWikiHelp) {
      dom.btnWikiHelp.addEventListener('click', () => {
        dom.stpModal.classList.add('active');
      });
    }

    if (dom.btnCloseStp) dom.btnCloseStp.addEventListener('click', () => dom.stpModal.classList.remove('active'));
    if (dom.btnCancelStp) dom.btnCancelStp.addEventListener('click', () => dom.stpModal.classList.remove('active'));
    if (dom.btnSendStp) {
      dom.btnSendStp.addEventListener('click', () => {
        dom.stpModal.classList.remove('active');
        showToast('Обращение в СТП успешно направлено. Номер заявки #СТП-48201');
      });
    }

    if (dom.btnBreakMenu) {
      dom.btnBreakMenu.addEventListener('click', () => {
        dom.breakModal.classList.add('active');
      });
    }

    if (dom.btnCloseBreak) dom.btnCloseBreak.addEventListener('click', () => dom.breakModal.classList.remove('active'));
    if (dom.btnCancelBreak) dom.btnCancelBreak.addEventListener('click', () => dom.breakModal.classList.remove('active'));
    if (dom.btnConfirmBreak) {
      dom.btnConfirmBreak.addEventListener('click', () => {
        dom.breakModal.classList.remove('active');
        showToast('Режим перерыва активирован. Звонки временно перенаправлены.');
      });
    }

    // Иконки горизонтального тулбара
    const toolbarButtons = document.querySelectorAll('.toolbar-btn');
    toolbarButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'wiki') return;
        toolbarButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showToast(`Открыт модуль: ${btn.querySelector('.t-label').textContent.toUpperCase()}`);
      });
    });
  }

  function clearExtendedFilter() {
    state.extFilter = {
      cardNumber: '', type: '', signs: '', subject: 'г. Москва', applicant: '',
      operator: '', arm: '', address: '', okrug: '', district: '',
      descriptiveAddress: '', service: '', description: '',
      channel: '', source: '', status: '', visOperator: ''
    };
    state.descriptiveAddressQuery = '';

    // Сброс всех инпутов и селектов
    const fieldIds = [
      'extCardNumber', 'extType', 'extSigns', 'extApplicant',
      'extOperator', 'extArm', 'extAddress', 'extOkrug', 'extDistrict',
      'extDescriptiveAddress', 'extService', 'extDescription',
      'extChannel', 'extSource', 'extStatus', 'extVisOperator'
    ];
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      }
    });

    const subjEl = document.getElementById('extSubject');
    if (subjEl) subjEl.value = 'г. Москва';

    // Сброс кнопок в модалке признаков
    document.querySelectorAll('.signs-opt-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.signs-q-btn').forEach(b => b.classList.remove('active'));

    updateClearButtonsVisibility();
  }

  function showToast(message) {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==========================================================================
  // 7. ТОЧКА ВХОДА
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initClock();
    setupEventListeners();
    updateClearButtonsVisibility();
    renderTable();
    console.log('Консоль грида ПОВ-112 успешно инициализирована со 100% аутентичностью.');
  });

})();
