import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { RegisterCustomerDto } from "./register-customer.dto";

describe("RegisterCustomerDto", () => {
  it("accepts valid customer registration details", async () => {
    const dto = plainToInstance(RegisterCustomerDto, {
      email: "customer@example.test",
      password: "a-long-customer-password",
      firstName: "Jamie",
      lastName: "Customer",
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it("rejects short passwords, invalid emails, and unexpected fields", async () => {
    const dto = plainToInstance(RegisterCustomerDto, {
      email: "not-an-email",
      password: "short",
      firstName: "Jamie",
      lastName: "Customer",
      isVerified: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const propertyNames = errors.map((error) => error.property);

    expect(propertyNames).toEqual(
      expect.arrayContaining(["email", "password", "isVerified"]),
    );
  });
});
