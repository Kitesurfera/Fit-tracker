# Performance Pro - PRD

## Problema Original
App de seguimiento y planificación de fitness con dos tipos de usuario: **entrenador** y **deportistas**.

## Requisitos del Producto
- **Autenticación**: Sistema JWT con roles (entrenador/deportista)
- **Gestión de usuarios**: Entrenadores crean cuentas de deportistas
- **Entrenamientos**: CRUD manual + importación CSV con soporte de video URLs
- **Tests físicos**: RM en sentadilla, press banca, peso muerto, CMJ, SJ, DJ + personalizados
- **Calendario interactivo**: Marcadores por día, vista expandible con ejercicios
- **Modo Entrenamiento**: Guía paso a paso para deportistas
- **UI/UX**: Estilo minimalista, selector de tema (Claro/Oscuro/Sistema), navegación por pestañas

## Arquitectura
- **Backend**: FastAPI + MongoDB (motor async) + JWT
- **Frontend**: Expo (React Native SDK 54) + Expo Router + TypeScript
- **Estado**: React Hooks + AsyncStorage para persistencia

## Funcionalidades Implementadas
- [x] Autenticación JWT (login/registro)
- [x] Gestión de deportistas (CRUD)
- [x] Entrenamientos manuales con video URLs
- [x] Importación CSV con columna de video
- [x] Plantilla CSV descargable e inline
- [x] Tests físicos (fuerza + pliometría)
- [x] Calendario interactivo con marcadores y expansión
- [x] Modo Entrenamiento guiado (series tracker, videos, navegación)
- [x] Ajustes editables (perfil, contraseña, notificaciones, unidades, tema)
- [x] Selector de tema 3 opciones
- [x] Analytics básico (resumen + progreso por test)
- [x] Completar entrenamientos (flujo completo)
- [x] Edición de entrenamientos por entrenador (editar, añadir, eliminar ejercicios)
- [x] Saltar series/ejercicios en Modo Entrenamiento + reporte detallado para entrenador
- [x] Tests de Fuerza Máxima bilateral (isquio, gemelo, cuádriceps, tibial, personalizado) en Newtons con valores IZQ/DER y cálculo de asimetría

## Backlog Priorizado
### P1 - Próximas
- Analíticas avanzadas: gráficos de progreso temporal por test
- Mejorar pestaña de Rendimiento con charts más visuales

### P2 - Futuras
- Notificaciones de récords personales (PR)
- Registro de intensidad de entrenamientos (RPE)
- Exportación de datos de progreso
- Estadísticas semanales/mensuales

## Credenciales de Test
- Entrenador: trainer_test@test.com / test123
- Deportista: athlete_test@test.com / test123
