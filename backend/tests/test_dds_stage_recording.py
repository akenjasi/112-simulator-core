"""Regressions from actual teacher/cadet browser notes, with no working DB."""
from types import SimpleNamespace

import pytest
from backend.core.dds_exercise import accuracy_issues, records_stage


@pytest.mark.parametrize('stage,note', [
    ('Начало реагирования', 'Бригада №2 выехала к месту происшествия.'),
    ('Прибытие', 'Первая бригада уже на месте происшествия, прибытие подтверждено.'),
    ('Проведение работ', 'Бригада №1 приступила к работам.'),
    ('Работы завершены', 'Задача выполнена.'),
])
def test_recorded_action_does_not_require_status_label(stage, note):
    assert records_stage(note, stage)


@pytest.mark.parametrize('stage,note', [
    ('Начало реагирования', 'Бригада не выехала.'),
    ('Прибытие', 'Прибытие не подтверждено.'),
    ('Проведение работ', 'Бригада ещё не приступила к работам.'),
    ('Работы завершены', 'Работы не завершены.'),
    ('Проведение работ', 'Бригада выехала.'),
    ('Прибытие', 'Иванов, бригада №1.'),
])
def test_negated_or_other_stage_does_not_confirm_stage(stage, note):
    assert not records_stage(note, stage)


def test_stage_fix_keeps_incorrect_brigade_and_missing_identity_issues():
    contact = {'id': 'contact', 'full_name': 'Иванов Иван Иванович',
               'position': 'Начальник бригады', 'brigade': '1'}
    report = {'id': 'report', 'contact_id': 'contact',
              'status': 'Проведение работ', 'comment_keywords': []}
    data = {'exercise': {'index': 0, 'plan': {'presentation': 'audio_only',
             'contacts': [contact], 'reports': [report]},
             'notes': {'report': 'Иванов. Бригада №2 приступила к работам.'}}}
    issues = accuracy_issues(data, SimpleNamespace(kind='status', status=report['status'], order_number='1', comment=''))
    assert any('ФИО' in issue for issue in issues)
    assert any('должность' in issue for issue in issues)
    assert any('номер бригады' in issue for issue in issues)
    assert not any('этап работ' in issue for issue in issues)


@pytest.mark.parametrize('keywords,expected_issue', [
    (['задача выполнена'], False),
    (['водитель деблокирован'], True),
])
def test_general_completion_is_equivalent_but_does_not_replace_specific_result(keywords, expected_issue):
    contact = {'id': 'contact', 'full_name': 'Иванов Иван Иванович',
               'position': 'Начальник бригады', 'brigade': '1'}
    report = {'id': 'report', 'contact_id': 'contact', 'status': 'Работы завершены', 'comment_keywords': keywords}
    data = {'exercise': {'index': 0, 'plan': {'presentation': 'audio_only',
             'contacts': [contact], 'reports': [report]},
             'notes': {'report': 'Начальник бригады Иванов Иван Иванович. Бригада 1. Работы завершены.'}}}
    issues = accuracy_issues(data, SimpleNamespace(kind='status', status=report['status'], order_number='1', comment='Работы завершены.'))
    assert any('результат работ' in issue for issue in issues) == expected_issue
