// Assembles the BookingRepository port from the per-entity query modules.
import type { BookingRepository } from "@server/domain/booking/ports";
import { getServiceByCode, listServices } from "./services";
import { listProfessionalsForService } from "./professionals";
import {
  getBookingsForPatientOnDay,
  getBookingsForProfessionalOnDay,
  insertBooking,
} from "./bookings";

export const pgBookingRepository: BookingRepository = {
  listServices,
  getServiceByCode,
  listProfessionalsForService,
  getBookingsForProfessionalOnDay,
  getBookingsForPatientOnDay,
  insertBooking,
};
